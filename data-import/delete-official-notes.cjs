#!/usr/bin/env node
// 删除挂在 disabled（非基线）账号下的 brand6 笔记（含官号「特斯拉」），先备份 CSV
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const OUT = path.join(__dirname, 'tesla-removed-notes-official.csv');
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.koxNote.findMany({
    where: { brandId: 6, account: { is: { status: { not: 'enabled' } } } },
    include: { account: { select: { nickname: true, status: true } } },
  });
  console.log(`待删除（挂非启用账号）: ${rows.length} 条`);
  if (!rows.length) { await prisma.$disconnect(); return; }
  const base = Object.keys(rows[0]).filter((k) => k !== 'account');
  const cols = [...base, 'official_nickname'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  fs.writeFileSync(OUT, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'official_nickname' ? r.account?.nickname : r[c])).join(','))].join('\n'), 'utf8');
  console.log(`备份 → ${OUT}（${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB）`);
  const nickDist = {};
  for (const r of rows) { const k = r.account?.nickname ?? '?'; nickDist[k] = (nickDist[k] ?? 0) + 1; }
  console.log('分布:', JSON.stringify(Object.fromEntries(Object.entries(nickDist).sort((a, b) => b[1] - a[1]).slice(0, 10))));
  if (apply) {
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 5000) {
      await prisma.koxNote.deleteMany({ where: { id: { in: ids.slice(i, i + 5000) } } });
    }
    const cnt = await prisma.koxNote.count({ where: { brandId: 6 } });
    console.log(`已删除，brand6 KoxNote 剩余 ${cnt}`);
  } else {
    console.log('预览模式（加 --apply 执行删除）');
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
