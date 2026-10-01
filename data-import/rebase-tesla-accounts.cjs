#!/usr/bin/env node
// 字段1：特斯拉账号基线重建（brandId=6）
// 数据源：tesla/特斯拉大区刷新对照表0924.xlsx（分KOS sheet，192 户）
// 步骤：①读 xlsx → tesla-rebase-192.json ②本地库 upsert 192 户 + 非对照表 brand6 账号置 disabled
// 服务器应用：scp JSON → node apply-tesla-rebase.cjs tesla-rebase-192.json
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const feRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const XLSX = feRequire('xlsx');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const XLSX_FILE = path.join(ROOT, 'tesla', '特斯拉大区刷新对照表0924.xlsx');
const OUT_JSON = path.join(__dirname, 'tesla-rebase-192.json');

const accounts = [];
const wb = XLSX.readFile(XLSX_FILE);
const ws = wb.Sheets['分KOS'] || wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
for (const r of rows) {
  const uid = String(r['账号uid'] ?? '').trim();
  const nickname = String(r['账号名称'] ?? '').trim();
  if (!uid || !nickname) continue;
  accounts.push({
    authorId: uid,
    nickname,
    accountType: 'KOS',
    regionName: String(r['大区更新'] ?? '').trim() || String(r['区域'] ?? '').trim() || null,
    storeName: String(r['门店'] ?? '').trim() || null,
    areaName: [r['省份'], r['城市']].filter(Boolean).map(String).join('·') || null,
    operatorName: String(r['认证人'] ?? '').trim() || null,
    authorUrl: String(r['账号链接'] ?? '').trim() || null,
  });
}
console.log(`对照表账号: ${accounts.length} 户`);
fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), accounts }, null, 1), 'utf8');
console.log(`JSON → ${OUT_JSON}`);

// ── 本地库应用 ──
const prisma = new PrismaClient();
(async () => {
  const uidSet = new Set(accounts.map((a) => a.authorId));
  let upserted = 0;
  for (const a of accounts) {
    const data = { ...a, status: 'enabled' };
    await prisma.kosAccount.upsert({
      where: { authorId: a.authorId },
      update: data,
      create: { ...data, brandId: 6, platform: 'xhs' },
    });
    upserted++;
  }
  const all = await prisma.kosAccount.findMany({ where: { brandId: 6, status: 'enabled' }, select: { id: true, authorId: true, nickname: true } });
  const disabled = all.filter((a) => !uidSet.has(a.authorId));
  for (const a of disabled) {
    await prisma.kosAccount.update({ where: { id: a.id }, data: { status: 'disabled' } });
  }
  console.log(`本地完成: upsert ${upserted}，disabled ${disabled.length}（${disabled.slice(0, 8).map((a) => a.nickname).join('、')}${disabled.length > 8 ? ' …' : ''}）`);
  const cnt = await prisma.kosAccount.count({ where: { brandId: 6, status: 'enabled' } });
  console.log(`brand6 enabled 账号数 = ${cnt}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
