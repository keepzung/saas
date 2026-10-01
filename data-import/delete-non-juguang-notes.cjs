#!/usr/bin/env node
// 删除聚光无记录的 brand6 笔记（先备份 CSV 再删除）
// 覆盖集：--covered <json>（collect-content-manage-ids 输出）；缺省用 KoxJuguangNoteDaily distinct
// 安全守卫：覆盖集为空时拒绝删除
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const apply = process.argv.includes('--apply');
const covIdx = process.argv.indexOf('--covered');
const covFile = covIdx > -1 ? process.argv[covIdx + 1] : null;
const OUT = path.join(__dirname, 'tesla-removed-notes-juguang.csv');
const prisma = new PrismaClient();
(async () => {
  let keep;
  if (covFile) {
    const j = JSON.parse(fs.readFileSync(covFile, 'utf8'));
    keep = new Set(j.noteIds);
    console.log(`覆盖集来源: ${covFile}（${keep.size} 个笔记ID）`);
  } else {
    const jn = await prisma.$queryRaw`SELECT DISTINCT "noteId" FROM "KoxJuguangNoteDaily" WHERE "brandId"=6`;
    keep = new Set(jn.map((r) => r.noteId));
    console.log(`覆盖集来源: KoxJuguangNoteDaily（${keep.size} 个笔记ID）`);
  }
  if (keep.size === 0) {
    console.error('⛔ 覆盖集为空，拒绝删除（保护守卫）');
    await prisma.$disconnect();
    process.exit(1);
  }
  const all = await prisma.koxNote.findMany({ where: { brandId: 6 } });
  const rows = all.filter((n) => !keep.has(n.noteId));
  console.log(`待删除: ${rows.length} 条；保留 ${all.length - rows.length}`);
  const cols = Object.keys(rows[0] ?? { id: '' });
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  fs.writeFileSync(OUT, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'utf8');
  console.log(`备份 → ${OUT}（${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB）`);
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
