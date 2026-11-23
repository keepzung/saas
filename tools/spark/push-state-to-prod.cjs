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

// ── 身份闸门（防串号最后一关，10-26 两次串号事故的根治）：state 里 localStorage.userName
//    必须匹配本 TAG 的预期身份，不符直接拒绝推送（生产库分毫不动）；确认无误可加 --force 强推 ──
const EXPECTED_USER = { RW: '原山互创', MDD: 'mkt数据', DF: 'MKT数据', GREE: 'MKT数据' };
const FORCE = process.argv.includes('--force');
const tagKey = String(TAG).toUpperCase();
const expectedUser = EXPECTED_USER[tagKey];
if (expectedUser && !FORCE) {
  let userName = '';
  for (const o of s.origins || [])
    for (const kv of o.localStorage || []) if (kv.name === 'userName') userName = kv.value;
  if (!userName) {
    console.error('push-state-to-prod: [身份闸门] state 里读不到 userName，无法确认身份；如确认登录无误，加 --force 重跑');
    process.exit(4);
  }
  if (userName !== expectedUser) {
    console.error(`push-state-to-prod: ❌串号拦截！state 身份="${userName}" ≠ ${tagKey} 预期="${expectedUser}"`);
    console.error('  本次推送已取消，生产库未被改动。请回到该品牌自己的登录窗口重新登录。');
    process.exit(3);
  }
  console.log(`[${TAG}] 身份校验通过: ${userName}`);
}

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
// 会话新鲜度最高的时刻立即拉数（T+1 口径：手动登录后马上补 D-1/D 缺口，不等凌晨波次）
const sync = spawnSync(
  'ssh',
  ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, `cd /opt/saas/tools && node trigger-sync.cjs all ${BRAND_ID}`],
  { encoding: 'utf8', timeout: 300000 },
);
console.log(`[${TAG}->brand${BRAND_ID}] 同步触发:`, sync.status === 0 ? String(sync.stdout || '').trim() || 'ok' : `失败 ${String(sync.stderr || '').slice(0, 120)}`);
