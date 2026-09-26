#!/usr/bin/env node
// 清理旧格力工作区（brandId=3，mock 数据）：
//   node cleanup-gree.js            （实删）
//   node cleanup-gree.js --dry-run  （只统计不删）
// 删除范围：brandId=3 的全部业务数据 + 3 区 KosAccount（级联占位统计/任务作者）+ Brand 本体
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const BRAND_ID = Number(process.env.GREE_BRAND_ID || 3);

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function count(prisma, model, where) {
  return prisma[model].count({ where });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const brand = await prisma.brand.findUnique({ where: { id: BRAND_ID } });
    if (!brand) {
      console.log(`brand ${BRAND_ID} 不存在，无需清理`);
      return;
    }
    console.log(`目标品牌: id=${brand.id} name=${brand.name}${DRY_RUN ? '（dry-run 只统计）' : ''}`);

    const steps = [
      ['insightDailyStat', 'insightDailyStat', { brandId: BRAND_ID }],
      ['insightReport', 'insightReport', { brandId: BRAND_ID }],
      ['insightContent', 'insightContent', { brandId: BRAND_ID }],
      ['laiguLead', 'laiguLead', { brandId: BRAND_ID }],
      ['campaignProjectAccount', 'koxCampaignProjectAccount', { project: { brandId: BRAND_ID } }],
      ['campaignProject', 'koxCampaignProject', { brandId: BRAND_ID }],
      ['sparkAccount', 'sparkAccount', { brandId: BRAND_ID }],
      ['campaignDailyStat', 'koxCampaignDailyStat', { brandId: BRAND_ID }],
      ['dealerSales', 'koxDealerSales', { brandId: BRAND_ID }],
      ['koxDailyStat', 'koxDailyStat', { brandId: BRAND_ID }],
      ['koxNote', 'koxNote', { brandId: BRAND_ID }],
      ['packageMaterial', 'packageMaterial', { package: { brandId: BRAND_ID } }],
      ['contentPackage', 'contentPackage', { brandId: BRAND_ID }],
      ['projectStats', 'projectStats', { project: { brandId: BRAND_ID } }],
      ['project', 'project', { brandId: BRAND_ID }],
      ['projectFolder', 'projectFolder', { brandId: BRAND_ID }],
      ['product', 'product', { brandId: BRAND_ID }],
      ['accountDailyStat', 'koxAccountDailyStat', { account: { brandId: BRAND_ID } }],
      ['taskAuthor', 'koxTaskAuthor', { account: { brandId: BRAND_ID } }],
      ['kosAccount', 'kosAccount', { brandId: BRAND_ID }],
      ['brandMember', 'brandMember', { brandId: BRAND_ID }],
    ];

    let total = 0;
    for (const [label, model, where] of steps) {
      const n = await count(prisma, model, where);
      total += n;
      console.log(`  ${label.padEnd(22)} ${n}`);
      if (!DRY_RUN && n > 0) await prisma[model].deleteMany({ where });
    }

    if (!DRY_RUN) {
      await prisma.brand.delete({ where: { id: BRAND_ID } });
      console.log(`brand ${BRAND_ID} (${brand.name}) 已删除`);
    }
    const brands = await prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
    console.log('剩余工作区:', brands.map((b) => `${b.id}=${b.name}`).join(' | '));
    console.log(`清理完成${DRY_RUN ? '（dry-run 未写库）' : ''}，涉及行数 ${total + 1}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('cleanup-gree failed:', e.message || e);
  process.exit(1);
});
