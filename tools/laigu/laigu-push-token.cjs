#!/usr/bin/env node
// 服务器侧：接收 /tmp/laigu-token.txt，推送到来鼓网关配置（brandId=6）
// 用法: node /opt/saas/tools/laigu-push-token.cjs
const fs = require('fs');
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');

const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
const secret = env.match(/^JWT_SECRET=(.*)$/m)[1].trim().replace(/^["']+|["']+$/g, '');
const admin = jwt.sign({ sub: 1, phone: '', role: 'ADMIN' }, secret, { expiresIn: '10m' });
const token = fs.readFileSync('/tmp/laigu-token.txt', 'utf8').trim();
if (!token) { console.error('token 为空'); process.exit(1); }

(async () => {
  const r = await fetch('http://127.0.0.1:3000/api/agency-api/laigu/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: admin },
    body: JSON.stringify({ brandId: 6, token }),
  }).then((x) => x.json());
  console.log('push result:', JSON.stringify(r.data ?? r));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
