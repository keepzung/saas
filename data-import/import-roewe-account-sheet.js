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

async function upsertAccount(prisma, slot, row, stat, slotType) {
  const authorId = String(slot.id || '').trim();
  const nickname = String(slot.name || '').trim();
  if (!authorId || !nickname) {
    stat.skipped += 1;
    return;
  }
  const regionName = String(row['区域'] || '').trim() || null;
  const areaName = [row['省'], row['市']].filter(Boolean).join('·') || null;
  const storeName = String(row['F经销商简称'] || '').trim() || null;
  // 主账户槽位=门店 KOB 主账户；第二槽位（主账户ID_1）=该店绑定的员工号，类型取行「账号类型」(KOS)
  const accountType = slotType || normType(row['账号类型']);
  // source='roster'：客户权威清单账号，运营总览 KOS/KOB/KOC 计数只统计该来源
  const data = { nickname, accountType, regionName, areaName, storeName, status: 'enabled', source: 'roster' };

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
      // 主账户槽位固定为门店 KOB 主账户（KOC 行除外）
      const rowType = normType(row['账号类型']);
      const mainType = rowType === 'KOC' ? 'KOC' : 'KOB';
      await upsertAccount(prisma, main, row, stat, mainType);
      // 第二账号列 = 该店绑定员工号（类型取行「账号类型」，通常 KOS）；与主账号不同才导入
      if (second.id && second.name && String(second.id) !== String(main.id)) {
        await upsertAccount(prisma, second, row, stat, rowType);
      }
    }

    // 清单行快照（替换式）：运营总览 KOS/KOB 计数按行口径（KOS 行=员工号绑定，KOB 行=主账户），与客户报表一致
    if (!DRY_RUN) {
      await prisma.kosRosterEntry.deleteMany({ where: { brandId: BRAND_ID } });
      const entries = rows.map((r) => {
        const rawType = String(r['账号类型'] || '').trim();
        return {
          brandId: BRAND_ID,
          // 行类型：仅明确的 KOS 行算 KOS（员工号绑定），KOB蓝V/空类型均归 KOB（门店主账户）
          rowType: rawType === 'KOS' ? 'KOS' : 'KOB',
        sqCode: String(r['SQ代码'] || '').trim() || null,
        region: String(r['区域'] || '').trim() || null,
        province: String(r['省'] || '').trim() || null,
        city: String(r['市'] || '').trim() || null,
        district: String(r['区县'] || '').trim() || null,
        storeName: String(r['F经销商简称'] || '').trim() || null,
        mainUid: String(r['主账户ID'] || '').trim() || null,
        mainName: String(r['主账户名称'] || '').trim() || null,
        staffUid: String(r['主账户ID_1'] || '').trim() || null,
        staffName: String(r['主账户名称_1'] || '').trim() || null,
        };
      });
      for (let i = 0; i < entries.length; i += 200) {
        await prisma.kosRosterEntry.createMany({ data: entries.slice(i, i + 200) });
      }
      const byType = {};
      for (const e of entries) byType[e.rowType] = (byType[e.rowType] || 0) + 1;
      console.log(`清单行快照: ${entries.length} 行`, JSON.stringify(byType));
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
