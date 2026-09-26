#!/usr/bin/env node
// 播种 partner 通道组织配置（SparkOrgConfig.channel='partner'）
// 用法: node seed-partner-org.js [--brand 6] [--cookie-file path] [--dry-run]
// cookie 文件默认 tools/spark/state/partner-tesla-state.json（Playwright storageState）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BRAND_ID = Number(arg('--brand', 6));
const DRY_RUN = process.argv.includes('--dry-run');
const COOKIE_FILE =
  arg('--cookie-file', null) || path.join(ROOT, 'tools', 'spark', 'state', 'partner-tesla-state.json');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

(async () => {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error(`cookie 文件不存在: ${COOKIE_FILE}`);
    process.exit(1);
  }
  const st = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  const cookie = st.cookies
    .filter((c) => /xiaohongshu\.com/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (cookie.length < 200) {
    console.error('cookie 过短，文件可能无效');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const data = {
      orgCode: 'partner-agent-leyun-7883',
      email: 'hall111798@163.com',
      cookie,
      channel: 'partner',
      excludeKeywords: '官号投放,官方',
      active: true,
      remark: '乐允 RTB 代理商主体（特斯拉聚光子账户）',
    };
    if (DRY_RUN) {
      console.log(`[dry-run] brand=${BRAND_ID} channel=partner cookie长度=${cookie.length}`);
      return;
    }
    const row = await prisma.sparkOrgConfig.upsert({
      where: { brandId: BRAND_ID },
      update: data,
      create: { brandId: BRAND_ID, ...data },
    });
    console.log(`SparkOrgConfig upsert 完成: id=${row.id} brand=${row.brandId} channel=${row.channel}`);
  } finally {
    await prisma.$disconnect();
  }
})();
