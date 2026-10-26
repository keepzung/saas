#!/usr/bin/env node
// 本地登录态推送生产库: node push-state-to-prod.cjs <TAG> <brandId> [partner]
// 读取 state/auth-<TAG>.json (或 partner-state-latest.json) 的 cookie, 经 SSH 更新 SparkOrgConfig
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TAG = process.argv[2] || '';
const BRAND_ID = process.argv[3] || '';
const SSH_HOST = process.env.PARTNER_SSH_HOST || 'root@119.28.157.150';
if (!TAG || !BRAND_ID) {
  console.error('用法: node push-state-to-prod.cjs <TAG> <brandId>');
  process.exit(1);
}
const stateFile =
  TAG === 'partner'
    ? path.join(__dirname, 'state', 'partner-state-latest.json')
    : path.join(__dirname, 'state', `auth-${TAG}.json`);
if (!fs.existsSync(stateFile)) {
  console.error(`push-state-to-prod: 缺少 ${stateFile}`);
  process.exit(1);
}
const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const cookies = (s.cookies || [])
  .filter((c) => (TAG === 'partner' ? /xiaohongshu\.com$/.test(c.domain) : true))
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
if (cookies.length < 50) {
  console.error('push-state-to-prod: cookie 过短');
  process.exit(1);
}
const r = spawnSync(
  'ssh',
  ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, `node /opt/saas/tools/spark/push-partner-cookie.cjs ${BRAND_ID}`],
  { input: cookies, encoding: 'utf8', timeout: 60000 },
);
if (r.status !== 0) {
  console.error(`push-state-to-prod: 推送失败 ${String(r.stderr || '').slice(0, 150)}`);
  process.exit(1);
}
console.log(`[${TAG}->brand${BRAND_ID}]`, String(r.stdout || '').trim());
