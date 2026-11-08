#!/usr/bin/env node
// 服务器端：接收 stdin 的 {platform,label,storageState}，自签 ADMIN JWT 调 /hotspot/sessions 入库
// stdin: {"platform":"xhs","label":"默认","storageState":{...}}
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const jwt = backendRequire('jsonwebtoken');
const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
const m = env.match(/JWT_SECRET="([^"]+)"/);
(async () => {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!payload.platform || !payload.storageState) throw new Error('payload 缺 platform/storageState');
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role }, m[1], { expiresIn: '10m' });
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/hotspot/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  console.log(JSON.stringify(j.data ?? j));
  if (j.code !== 100) process.exit(1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
