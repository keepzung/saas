#!/usr/bin/env node
// 服务器端接收器: 从 stdin 读专业号 storageState JSON, 更新 ProOrgConfig(brandId=$1, 默认6)
// 调用方: 本机 pro-keepalive-local.cjs 经 SSH 推送
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const envFile = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(DATABASE_URL)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const brandId = Number(process.argv[2] || 6);
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', async () => {
  const st = raw.trim();
  if (st.length < 500 || !st.startsWith('{')) {
    console.error('push-pro-state-stdin: storageState 无效 (长度 ' + st.length + ')');
    process.exit(1);
  }
  try {
    JSON.parse(st);
  } catch {
    console.error('push-pro-state-stdin: 非 JSON');
    process.exit(1);
  }
  const p = new PrismaClient();
  try {
    const before = await p.proOrgConfig.findUnique({ where: { brandId }, select: { updatedAt: true } });
    if (!before) throw new Error(`brandId=${brandId} 无 ProOrgConfig 记录`);
    await p.proOrgConfig.update({ where: { brandId }, data: { storageState: st } });
    console.log(`brand${brandId} storageState 已更新 (${st.length}B, 原 updatedAt=${before.updatedAt.toISOString()})`);
    await p.$disconnect();
  } catch (e) {
    console.error('push-pro-state-stdin 失败:', e.message);
    await p.$disconnect().catch(() => {});
    process.exit(1);
  }
});
