#!/usr/bin/env node
// 来鼓（brandId=5）特斯拉租户测试数据清洗：备份后全量删除 LaiguLead
// 背景：开发期 LAIGU_APP_KEY/SECRET 接的是特斯拉租户，同步把会话写死 brandId=5，
//       特斯拉客户的昵称/手机号/留资/adInfo（特斯拉KOS项目等投放标签）整体落入 Morgandada 工作区。
// 用法:
//   node cleanup-laigu-brand5.cjs --dry-run        # 只统计
//   node cleanup-laigu-brand5.cjs --backup-only    # 只导出备份
//   node cleanup-laigu-brand5.cjs                  # 备份 + 全量删除（默认）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_ONLY = process.argv.includes('--backup-only');
const BRAND = 5;
const DATE = new Date().toISOString().slice(0, 10);
const BACKUP_FILE = path.join(__dirname, `backup-laigu-brand5-${DATE}.json`);

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function backup(prisma) {
  const total = await prisma.laiguLead.count({ where: { brandId: BRAND } });
  console.log(`备份 brandId=${BRAND} LaiguLead ${total} 条 -> ${path.relative(ROOT, BACKUP_FILE)}`);
  const stream = fs.createWriteStream(BACKUP_FILE, { encoding: 'utf8' });
  stream.write('[\n');
  let lastId = 0;
  let written = 0;
  for (;;) {
    const batch = await prisma.laiguLead.findMany({
      where: { brandId: BRAND, id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: 500,
    });
    if (!batch.length) break;
    lastId = batch[batch.length - 1].id;
    const chunk = batch
      .map((row) => JSON.stringify(row))
      .join(',\n');
    stream.write((written > 0 ? ',\n' : '') + chunk);
    written += batch.length;
    if (written % 2000 === 0) console.log(`  ... ${written}/${total}`);
  }
  stream.write('\n]\n');
  await new Promise((resolve) => stream.end(resolve));
  const sizeMb = (fs.statSync(BACKUP_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`备份完成: ${written} 条, ${sizeMb} MB`);
  return written;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const total = await prisma.laiguLead.count({ where: { brandId: BRAND } });
    const mock = await prisma.laiguLead.count({ where: { brandId: BRAND, sessionId: { startsWith: 'mock_' } } });
    console.log(`brandId=${BRAND} LaiguLead: ${total} 条（含 mock 占位 ${mock} 条）`);

    if (DRY_RUN) {
      console.log('--dry-run：不备份不删除');
      return;
    }

    await backup(prisma);
    if (BACKUP_ONLY) {
      console.log('--backup-only：跳过删除');
      return;
    }

    const removed = await prisma.laiguLead.deleteMany({ where: { brandId: BRAND } });
    console.log(`已删除 brandId=${BRAND} LaiguLead: ${removed.count} 条`);

    // 影响面确认：品牌6（特斯拉工作区）的来鼓数据不动
    const remain = await prisma.laiguLead.groupBy({ by: ['brandId'], _count: true });
    const comment6 = await prisma.laiguComment.count({ where: { brandId: 6 } });
    console.log('剩余 LaiguLead 分布:', JSON.stringify(remain.map((r) => ({ brandId: r.brandId, count: r._count }))));
    console.log(`brand6 LaiguComment（特斯拉工作区，不动）: ${comment6} 条`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1); });
