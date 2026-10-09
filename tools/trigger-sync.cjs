// 服务器端同步触发器：自动签 token → 调本地 spark/sync API
// 用法: node trigger-sync.cjs campaign 6
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
const jwt = backendRequire('jsonwebtoken');
const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
const m = env.match(/JWT_SECRET="([^"]+)"/);
(async () => {
  const type = process.argv[2] || 'campaign';
  const brandId = process.argv[3] || '6';
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: 6 }, m[1], { expiresIn: '30m' });
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/spark/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ type, brandId: Number(brandId) }),
  });
  const j = await res.json();
  console.log(JSON.stringify(j.data ?? j, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
