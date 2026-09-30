#!/usr/bin/env node
// 导出本地封面映射（noteId,coverUrl,title）CSV，供生产库 apply-covers-prod.cjs 回填
// 用法: node export-covers-csv.js [输出路径，默认 data-import/tesla-covers.csv]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire(path.resolve(__dirname, '..', 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

(async () => {
  const out = process.argv[2] || path.join(__dirname, 'tesla-covers.csv');
  const prisma = new PrismaClient();
  const rows = await prisma.koxNote.findMany({
    where: { brandId: 6, coverUrl: { not: null } },
    select: { noteId: true, coverUrl: true, title: true },
  });
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    '\uFEFF' +
    ['noteId,coverUrl,title', ...rows.map((r) => [r.noteId, r.coverUrl, r.title].map(esc).join(','))].join('\r\n');
  fs.writeFileSync(out, csv, 'utf8');
  console.log(`导出 ${rows.length} 行 → ${out}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
