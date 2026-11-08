#!/usr/bin/env node
// 本地 → 生产：推送平台登录态（经 SSH 在服务器上执行 push-session-server.cjs）
// 用法: node push-session.cjs <xhs|bilibili> [label]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PLATFORM = process.argv[2] || '';
const LABEL = process.argv[3] || '默认';
const SSH_HOST = process.env.HOTSPOT_SSH_HOST || 'root@119.28.157.150';
if (!PLATFORM) {
  console.error('用法: node push-session.cjs <xhs|bilibili> [label]');
  process.exit(1);
}
const stateFile = path.join(__dirname, 'state', PLATFORM === 'xhs' ? 'xhs-web.json' : `${PLATFORM}.json`);
if (!fs.existsSync(stateFile)) {
  console.error(`push-session: 缺少 ${stateFile}，请先在本机运行对应 login 脚本`);
  process.exit(1);
}
const state = fs.readFileSync(stateFile, 'utf8');
if (state.length < 100) {
  console.error('push-session: state 内容过短');
  process.exit(1);
}
const payload = JSON.stringify({ platform: PLATFORM, label: LABEL, storageState: JSON.parse(state) });
const r = spawnSync(
  'ssh',
  ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, 'node /opt/saas/tools/hotspot/push-session-server.cjs'],
  { input: payload, encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
);
if (r.status !== 0) {
  console.error(`push-session: 推送失败 ${String(r.stderr || '').slice(0, 200)}`);
  process.exit(1);
}
console.log(`[${PLATFORM}->prod]`, String(r.stdout || '').trim());
