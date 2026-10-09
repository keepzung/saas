// 服务器端触发：E 日档（dateType=4）历史回填 /pro/sync/backfill
// 用法: node trigger-pro-backfill.cjs [fromYYYY-MM-DD] [toYYYY-MM-DD]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
const jwt = backendRequire('jsonwebtoken');
const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
const m = env.match(/JWT_SECRET="([^"]+)"/);
const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
(async () => {
  const to = process.argv[3] || dayStr(new Date(Date.now() - 86400000));
  const from = process.argv[2] || dayStr(new Date(Date.now() - 31 * 86400000));
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: 6 }, m[1], { expiresIn: '2h' });
  console.log(`backfill ${from} ~ ${to} 开始...`);
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/pro/sync/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ brandId: 6, from, to }),
  });
  const j = await res.json();
  console.log(JSON.stringify(j.data ?? j, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
