#!/usr/bin/env node
// 服务器端：跑一轮达人匹配（验证/运营用）
// 用法: node match-run-server.cjs [brandId=1] [productId=该品牌第一个产品]
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const jwt = backendRequire('jsonwebtoken');
const { PrismaClient } = backendRequire('@prisma/client');

(async () => {
  const brandId = Number(process.argv[2] ?? 1);
  const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  const secret = env.match(/JWT_SECRET="?([^"\r\n]+)"?/)[1];
  const p = new PrismaClient();
  let productId = Number(process.argv[3] ?? 0);
  if (!productId) {
    const prod = await p.product.findFirst({ where: { brandId, configType: 'product' }, orderBy: { id: 'asc' }, select: { id: true, name: true } });
    if (!prod) {
      console.log(`brand ${brandId} 没有产品，先在资料库建产品`);
      await p.$disconnect();
      process.exit(1);
    }
    productId = prod.id;
    console.log(`[product] brand ${brandId} → #${prod.id} ${prod.name}`);
  }
  const user = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: user.id, phone: user.phone, role: user.role }, secret, { expiresIn: '10m' });

  const run = await (
    await fetch('http://127.0.0.1:3000/api/agency-api/hotspot/match/run', {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, productId }),
    })
  ).json();
  console.log('[match/run]', JSON.stringify(run.data ?? run));
  if (run.code !== 100) process.exit(1);
  const list = await (
    await fetch(`http://127.0.0.1:3000/api/agency-api/hotspot/match?brandId=${brandId}&productId=${productId}&pageSize=10`, { headers: { token } })
  ).json();
  for (const m of (list.data?.items ?? []).slice(0, 8)) {
    console.log(`  ${m.score} | ${(m.creator?.nickname ?? '').slice(0, 24)} | fans=${m.creator?.fans} | ${(m.rationale ?? '').slice(0, 56)}`);
  }
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
