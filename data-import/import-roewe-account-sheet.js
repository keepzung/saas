#!/usr/bin/env node
// 荣威账号清单导入（客户「账号清单」sheet：SQ代码/区域/省市区/账号类型/主账户ID/主账户名称）
// - 按主账户ID(authorId) upsert；区域/省市/账号类型/经销商(storeName) 一并写入
// - 若同昵称的「自动注册账号」(authorId=auto_b2_*) 已存在 → 原位升级为真实 UID（笔记归属不丢）
// 用法: node import-roewe-account-sheet.js [--file <xlsx>] [--dry-run]

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const fileIdx = process.argv.indexOf('--file');
const DIR = path.join(ROOT, 'roewe');
const FILE =
  fileIdx > -1 && process.argv[fileIdx + 1]
    ? path.resolve(process.argv[fileIdx + 1])
    : path.join(DIR, fs.readdirSync(DIR).find((x) => x.startsWith('sheet2') && x.endsWith('.xlsx')) || '');

const BRAND_ID = Number(process.env.BRAND_ID || 2);

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const normType = (v) => {
  const s = String(v || '').toUpperCase();
  if (s.includes('KOB')) return 'KOB';
  if (s.includes('KOC')) return 'KOC';
  if (s.includes('KOS')) return 'KOS';
  return 'KOS';
};

async function upsertAccount(prisma, slot, row, stat) {
  const authorId = String(slot.id || '').trim();
  const nickname = String(slot.name || '').trim();
  if (!authorId || !nickname) {
    stat.skipped += 1;
    return;
  }
  const regionName = String(row['区域'] || '').trim() || null;
  const areaName = [row['省'], row['市']].filter(Boolean).join('·') || null;
  const storeName = String(row['F经销商简称'] || '').trim() || null;
  const accountType = normType(row['账号类型']);
  const data = { nickname, accountType, regionName, areaName, storeName, status: 'enabled' };

  const byId = await prisma.kosAccount.findUnique({ where: { authorId } });
  if (byId) {
    await prisma.kosAccount.update({ where: { authorId }, data });
    stat.updated += 1;
    return;
  }
  // 同昵称的自动注册账号（authorId=auto_b2_*）→ 原位升级为真实 UID，笔记归属保留
  const auto = await prisma.kosAccount.findFirst({
    where: { brandId: BRAND_ID, nickname, authorId: { startsWith: 'auto_b2_' } },
  });
  if (auto) {
    await prisma.kosAccount.update({ where: { id: auto.id }, data: { authorId, ...data } });
    stat.upgraded += 1;
    return;
  }
  await prisma.kosAccount.create({
    data: { authorId, nickname, platform: 'xhs', brandId: BRAND_ID, ...data },
  });
  stat.created += 1;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`未找到账号清单文件（含 sheet2 前缀的 xlsx）: ${FILE}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['账号清单'], { defval: null });
  console.log(`=== 荣威账号清单导入 brand=${BRAND_ID}：${rows.length} 行${DRY_RUN ? '（dry-run）' : ''} ===`);
  const prisma = new PrismaClient();
  const stat = { created: 0, updated: 0, upgraded: 0, skipped: 0 };
  try {
    for (const row of rows) {
      const main = { id: row['主账户ID'], name: row['主账户名称'] };
      const second = { id: row['主账户ID_1'], name: row['主账户名称_1'] };
      await upsertAccount(prisma, main, row, stat);
      // 第二账号列存在且与主账号不同 → 作为独立账号导入
      if (second.id && second.name && String(second.id) !== String(main.id)) {
        await upsertAccount(prisma, second, row, stat);
      }
    }
    console.log(
      `=== 完成 === 新建 ${stat.created} / 更新 ${stat.updated} / 自动账号升级 ${stat.upgraded} / 跳过 ${stat.skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e.message || e);
  process.exit(1);
});
