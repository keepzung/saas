#!/usr/bin/env node
// MorganDaDa 矩阵账号昵称对齐（2026-10-05 首次 MCC 同步后）
// 平台实际昵称 vs 客户 Excel 的差异：改名 3 个 + 新增 5 个（ Excel 未收录的在职员工号/品牌主账号）
// 运行: node reconcile-mdd-nicknames.js [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const DRY_RUN = process.argv.includes('--dry-run');
const BRAND = 5;
const md5 = (s) => require('crypto').createHash('md5').update(s).digest('hex');
const acct = (nickname, extra = {}) => ({
  authorId: `mdd_${md5(nickname).slice(0, 16)}`,
  nickname,
  platform: 'xhs',
  accountType: 'KOS',
  status: 'enabled',
  brandId: BRAND,
  ...extra,
});

const RENAMES = [
  // from（Excel 口径） -> to（平台实际昵称）
  { from: 'MorganDaDa南京德基-胡胡', to: 'Morgandada南京德基-胡胡' },
  { from: 'MorganDaDa深圳罗湖万象城', to: 'MorganDaDa深圳万象城', extra: { storeName: '深圳万象城' } },
  { from: 'MorganDaDa深圳罗湖万象城-小青', to: 'MorganDaDa深圳万象城-小青', extra: { storeName: '深圳万象城' } },
];

const ADDITIONS = [
  acct('MorganDaDa武商Mall-Luna', { accountTag: '员工号', storeName: '武商MALL', areaName: '武汉', operatorName: 'Luna' }),
  acct('MorganDaDa上海久光-蘑菇', { accountTag: '员工号', storeName: '上海久光', areaName: '上海', operatorName: '蘑菇' }),
  acct('MorganDaDa上海久光-小羊', { accountTag: '员工号', storeName: '上海久光', areaName: '上海', operatorName: '小羊' }),
  acct('MorganDaDa深圳万象城-文文', { accountTag: '员工号', storeName: '深圳万象城', areaName: '深圳', operatorName: '文文' }),
  acct('MorganDaDa', { accountTag: '店铺号', storeName: null, areaName: null, operatorName: null }),
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const r of RENAMES) {
      const row = await prisma.kosAccount.findFirst({ where: { brandId: BRAND, nickname: r.from } });
      if (!row) {
        console.log(`改名跳过（未找到）: ${r.from}`);
        continue;
      }
      if (DRY_RUN) console.log(`[dry] 改名: ${r.from} -> ${r.to}`);
      else await prisma.kosAccount.update({ where: { id: row.id }, data: { nickname: r.to, ...(r.extra ?? {}) } });
    }
    for (const a of ADDITIONS) {
      const exists = await prisma.kosAccount.findUnique({ where: { authorId: a.authorId } });
      if (exists) {
        console.log(`新增跳过（已存在）: ${a.nickname}`);
        continue;
      }
      if (DRY_RUN) console.log(`[dry] 新增: ${a.nickname} [${a.accountTag}/${a.storeName}]`);
      else await prisma.kosAccount.create({ data: a });
    }
    const total = await prisma.kosAccount.count({ where: { brandId: BRAND } });
    console.log(`完成，brandId=5 现有账号: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
