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
  const body = { type, brandId: Number(brandId) };
  // 透传 noteOpts 标记：--full / --backfill / --promoted；--date=YYYY-MM-DD 指定补数日期
  if (process.argv.includes('--full')) body.full = true;
  if (process.argv.includes('--backfill')) body.backfill = true;
  if (process.argv.includes('--promoted')) body.promoted = true;
  const dateArg = process.argv.find((a) => a.startsWith('--date='));
  if (dateArg) body.date = dateArg.slice(7);
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: Number(brandId) }, m[1], { expiresIn: '30m' });
  // notes_daily 等重同步服务端可跑 5 分钟以上: undici fetch 默认 300s 响应头超时会先断
  // (2026-11-25 实测),改用 http.request 显式 30 分钟超时;服务端本身幂等,断线重试无副作用
  const j = await new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = require('http').request('http://127.0.0.1:3000/api/agency-api/spark/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token, 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30 * 60 * 1000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json: ' + buf.slice(0, 100))); } });
    });
    req.on('timeout', () => req.destroy(new Error('client timeout 30min')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  console.log(JSON.stringify(j.data ?? j, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
