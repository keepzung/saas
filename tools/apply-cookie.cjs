// 将 /tmp/b{ID}-cookie.txt 写入 SparkOrgConfig(brandId) 并触发一次同步
// 用法: node apply-cookie.cjs <brandId> <mcc|partner>
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const BACKEND_DIR = path.join('/opt/saas', 'backend');
const br = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = br('@prisma/client');
for (const l of fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const brandId = Number(process.argv[2]);
const platform = process.argv[3] || 'mcc';
const cookie = fs.readFileSync(`/tmp/b${brandId}-cookie.txt`, 'utf8').trim();
if (cookie.length < 100) { console.error('cookie 太短，疑似空文件'); process.exit(2); }
const p = new PrismaClient();
(async () => {
  const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId } });
  if (!cfg) { console.error(`SparkOrgConfig 无 brandId=${brandId}`); process.exit(2); }
  await p.sparkOrgConfig.update({ where: { brandId }, data: { cookie, lastSyncAt: new Date() } });
  console.log(`brand${brandId}(${platform}) cookie 已写入，长度=${cookie.length}，原名长度=${cfg.cookie?.length ?? 0}`);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); }).finally(() => p.$disconnect());
