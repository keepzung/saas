#!/usr/bin/env node
// Morgandada（brandId=5）星火 MCC 组织配置落库（东风 seed-df-org.js 同款）
// 前置：拿到 MorganDaDa 组织的 orgCode（MCC 后台组织切换器 / F12 任意请求 accountOrgCode）
// 用法: node seed-mdd-org.js --org <orgCode> [--email <mcc账号>] [--cookie-file tools/spark/state/auth-mdd.json] [--dry-run]
// 说明：cookie 取登录态导出文件；跑完 POST /spark/sync {brandId:5,type:"all"} 立即验证
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = require('module').createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const DRY_RUN = process.argv.includes('--dry-run');
const ORG = arg('--org', '');
const EMAIL = arg('--email', '');
const COOKIE_FILE = path.resolve(ROOT, arg('--cookie-file', 'tools/spark/state/auth-mdd.json'));

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!ORG) {
  console.error('缺少 --org <orgCode>（MCC 组织切换器可见，形如 1942550061000474624）');
  process.exit(1);
}

function cookieFromState(file) {
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  return state.cookies?.map((c) => `${c.name}=${c.value}`).join('; ') ?? null;
}

async function main() {
  const cookie = cookieFromState(COOKIE_FILE);
  if (!cookie) {
    console.error(`cookie 文件无效: ${COOKIE_FILE}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const data = {
      orgCode: ORG,
      channel: 'mcc',
      email: EMAIL || null,
      cookie,
      active: true,
      remark: 'MorganDaDa MCC 组织（小红书专业号矩阵 21 账号）',
    };
    if (DRY_RUN) {
      console.log('--dry-run:', JSON.stringify({ brandId: 5, ...data, cookie: `${cookie.slice(0, 40)}...` }));
      return;
    }
    const row = await prisma.sparkOrgConfig.upsert({
      where: { brandId: 5 },
      update: data,
      create: { brandId: 5, ...data },
    });
    console.log(`SparkOrgConfig brand=5 已就绪: org=${row.orgCode} channel=${row.channel} active=${row.active}`);
    console.log('下一步: POST /api/agency-api/spark/sync {"brandId":5,"type":"all"} 触发同步验证');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
