#!/usr/bin/env node
// 服务器端：音色功能自检（voices 列表 + 试听端点实测，验证服务器可连 edge-tts）
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const jwt = backendRequire('jsonwebtoken');

(async () => {
  const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  const secret = env.match(/JWT_SECRET="?([^"\r\n]+)"?/)[1];
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role }, secret, { expiresIn: '10m' });
  const H = { token, 'Content-Type': 'application/json' };

  const vs = await (await fetch('http://127.0.0.1:3000/api/agency-api/hotspot/voices', { headers: { token } })).json();
  console.log('[voices]', vs.code === 100 ? `${vs.data.items.length} 个音色，默认 ${vs.data.default}` : JSON.stringify(vs));

  const pv = await (
    await fetch('http://127.0.0.1:3000/api/agency-api/hotspot/videos/voice-preview', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ voice: 'zh-CN-YunjianNeural' }),
    })
  ).json();
  console.log('[preview]', JSON.stringify(pv.data ?? pv));
  if (pv.data?.url) {
    const filePath = '/opt/saas/backend/uploads' + pv.data.url.replace('/uploads', '');
    if (fs.existsSync(filePath)) {
      console.log('[file]', filePath, fs.statSync(filePath).size, 'bytes');
    } else {
      console.log('[file] MISSING:', filePath);
      process.exit(1);
    }
  }
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
