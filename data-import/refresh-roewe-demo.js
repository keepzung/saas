#!/usr/bin/env node
// 【已废弃 2026-10-15】荣威经销商排行已切换真实数据口径（KoxNote 真实笔记 +
// ProClueToolStatDaily 获客工具留资，见 kox.service.ts rankingRealStore），
// 占位日统计不再被该页面读取。保留本脚本仅供回滚演示数据时使用：
//
// 荣威(brand 2)演示数据刷新脚本（可重复执行）：
//   1) 删除并重建 brand 2 最近 60 天的 KoxAccountDailyStat 占位日统计
//      （生成器逻辑与 import-roewe.js 完全一致，仅日期窗口滚动到今天）
//   2) KoxNote.publishTime 整体平移整数天，使最新笔记≈今天（保持时刻不变）
// 用法: node refresh-roewe-demo.js [--dry-run] [--stats-only] [--notes-only]

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient, Prisma } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const STATS_ONLY = process.argv.includes('--stats-only');
const NOTES_ONLY = process.argv.includes('--notes-only');
const BRAND_ID = Number(process.env.BRAND_ID || 2); // 荣威品牌

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DAY = 24 * 60 * 60 * 1000;
const d10 = (v) => (v ? String(v).slice(0, 10) : '-');

async function refreshDailyStats(prisma) {
  const accounts = await prisma.kosAccount.findMany({
    where: { brandId: BRAND_ID },
    select: { id: true },
  });
  if (!accounts.length) {
    console.log('[KoxAccountDailyStat] brand 无账号，跳过');
    return;
  }
  const ids = accounts.map((a) => a.id);
  const old = await prisma.koxAccountDailyStat.aggregate({
    where: { accountId: { in: ids } },
    _min: { statDate: true },
    _max: { statDate: true },
    _count: true,
  });
  console.log(
    `[KoxAccountDailyStat] 旧数据 ${old._count} 条（${d10(old._min.statDate)} ~ ${d10(old._max.statDate)}），将删除重建`,
  );
  if (DRY_RUN) return;

  const del = await prisma.koxAccountDailyStat.deleteMany({
    where: { accountId: { in: ids } },
  });
  console.log(`[KoxAccountDailyStat] 已删除 ${del.count} 条`);

  const rand = (min, max) => min + Math.floor(Math.random() * (max - min));
  let statCount = 0;
  for (const acc of accounts) {
    const rows = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      d.setHours(0, 0, 0, 0);
      const w = d.getDay();
      const boost = w === 0 || w === 6 ? 1.3 : 1;
      const growth = 1 + (59 - i) * 0.005;
      const item = Math.max(0, Math.round(rand(0, 3) * boost * growth));
      const view = item * rand(2200, 5200);
      const digg = Math.floor(view * (rand(3, 9) / 100));
      rows.push({
        accountId: acc.id,
        statDate: d,
        itemCnt: item,
        crazyItemCnt: item > 2 && Math.random() < 0.1 ? 1 : 0,
        exposureSum: view * rand(8, 15),
        viewSum: view,
        diggSum: digg,
        interactionSum: digg + Math.floor(digg / rand(4, 9)),
        followCountSum: rand(10, 90),
        pmLeads: Math.random() < 0.4 ? rand(1, 6) : 0,
        toolClickCnt: Math.floor(view * 0.012),
      });
    }
    await prisma.koxAccountDailyStat.createMany({ data: rows });
    statCount += rows.length;
  }
  console.log(`[KoxAccountDailyStat] 重建 ${statCount} 条（${accounts.length} 账号 × 60 天，截至今天）`);
}

async function shiftNotes(prisma) {
  const agg = await prisma.koxNote.aggregate({
    where: { brandId: BRAND_ID, publishTime: { not: null } },
    _min: { publishTime: true },
    _max: { publishTime: true },
    _count: true,
  });
  if (!agg._count) {
    console.log('[KoxNote] brand 无笔记，跳过平移');
    return;
  }
  const maxPub = agg._max.publishTime;
  // 目标：最新笔记落在「今天 20:00」（东八区）附近，按整天平移保持时刻不变
  const now = new Date();
  const todayTarget = new Date(`${now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })}T20:00:00+08:00`);
  const deltaDays = Math.round((todayTarget.getTime() - maxPub.getTime()) / DAY);
  console.log(
    `[KoxNote] 笔记 ${agg._count} 条（发布 ${d10(agg._min.publishTime)} ~ ${d10(maxPub)}），平移 ${deltaDays} 天`,
  );
  if (DRY_RUN || deltaDays === 0) {
    if (!DRY_RUN) console.log('[KoxNote] 无需平移');
    return;
  }
  const updated = await prisma.$executeRaw(
    Prisma.sql`UPDATE "KoxNote" SET "publishTime" = "publishTime" + (${deltaDays} * interval '1 day') WHERE "brandId" = ${BRAND_ID} AND "publishTime" IS NOT NULL`,
  );
  console.log(`[KoxNote] 已平移 ${updated} 条笔记的 publishTime（+${deltaDays} 天）`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`=== 荣威演示数据刷新 brand=${BRAND_ID}${DRY_RUN ? '（dry-run 预览）' : ''} ===`);
    if (!NOTES_ONLY) await refreshDailyStats(prisma);
    if (!STATS_ONLY) await shiftNotes(prisma);
    console.log('=== 完成 ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('刷新失败:', e.message || e);
  process.exit(1);
});
