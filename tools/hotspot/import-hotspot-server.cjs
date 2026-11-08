#!/usr/bin/env node
// 服务器端：接收 stdin 的 {keyword, items[]}，自签 ADMIN JWT 调 /hotspot/contents/import 落库
// 用法: node import-hotspot-server.cjs <brandId> <sourceType>   （stdin: {"keyword":"特斯拉","items":[...]}）
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const jwt = backendRequire('jsonwebtoken');

const BRAND_ID = Number(process.argv[2] ?? 6);
const SOURCE_TYPE = process.argv[3] ?? 'search';

(async () => {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!Array.isArray(payload.items) || !payload.items.length) {
    console.log(JSON.stringify({ inserted: 0, updated: 0, note: 'empty' }));
    return;
  }
  const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  const m = env.match(/JWT_SECRET="?([^"\r\n]+)"?/);
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role }, m[1], { expiresIn: '10m' });
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/hotspot/contents/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({
      brandId: BRAND_ID,
      sourceType: SOURCE_TYPE,
      sourceKeyword: payload.keyword ?? null,
      items: payload.items,
    }),
  });
  const j = await res.json();
  console.log(JSON.stringify(j.data ?? j));
  if (j.code !== 100) process.exit(1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
