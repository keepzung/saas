#!/usr/bin/env node
// 服务器端接收器: 从 stdin 读 partner cookie, 更新 SparkOrgConfig(brandId=$1, 默认6)
// 调用方: 本机 partner-keepalive-local.cjs 经 SSH 推送
//   ssh host "node /opt/saas/tools/spark/push-partner-cookie.cjs 6" <<< "<cookie串>"
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..'); // → /opt/saas
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

// 独立进程需要手动注入 DATABASE_URL
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
  const cookie = raw.trim();
  if (cookie.length < 100 || !/^[A-Za-z0-9_%.;=\- ]+$/.test(cookie.slice(0, 50))) {
    console.error('push-partner-cookie: cookie 无效 (长度 ' + cookie.length + ')');
    process.exit(1);
  }
  const p = new PrismaClient();
  try {
    const before = await p.sparkOrgConfig.findUnique({ where: { brandId }, select: { updatedAt: true, channel: true } });
    if (!before) throw new Error(`brandId=${brandId} 无 SparkOrgConfig 记录`);
    await p.sparkOrgConfig.update({ where: { brandId }, data: { cookie } });
    console.log(`brand${brandId} cookie 已更新 (${cookie.length}B, ${before.channel}, 原 updatedAt=${before.updatedAt.toISOString()})`);
    await p.$disconnect();
  } catch (e) {
    console.error('push-partner-cookie 失败:', e.message);
    await p.$disconnect().catch(() => {});
    process.exit(1);
  }
});
