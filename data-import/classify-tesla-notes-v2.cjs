#!/usr/bin/env node
// 特斯拉笔记分类回填 v2（brandId=6）：modelTag/category 空值或未提及的行按标题规则填充
// 另：历史短标签（YL/YP/3P）统一为 Model 前缀
// 用法: node classify-tesla-notes-v2.cjs [--dry-run]
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const rq = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = rq('@prisma/client');
const fs = require('fs');
for (const l of fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

// 复用 backend 编译产物（与后端口径完全一致）
let classifyTeslaNote;
try {
  ({ classifyTeslaNote } = require(path.join(ROOT, 'backend', 'dist', 'common', 'note-classify.js')));
} catch {
  console.error('未找到 backend/dist/common/note-classify.js（先 npm run build）');
  process.exit(1);
}

const SHORT_TAG_MAP = { YL: 'ModelYL', YP: 'ModelYP', '3P': 'Model3P', modelx: 'ModelX', models: 'ModelS' };

(async () => {
  let cursor = 0;
  let fixedTag = 0, fixedCat = 0, fixedShort = 0, scanned = 0;
  for (;;) {
    const rows = await prisma.koxNote.findMany({
      where: { brandId: 6, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, title: true, category: true, modelTag: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const r of rows) {
      scanned += 1;
      const data = {};
      // 短标签统一
      if (r.modelTag && SHORT_TAG_MAP[r.modelTag]) {
        data.modelTag = SHORT_TAG_MAP[r.modelTag];
        fixedShort += 1;
      }
      // 空值/未提及 → 规则分类
      const needTag = !r.modelTag || r.modelTag === '未提及';
      const needCat = !r.category;
      if (needTag || needCat) {
        const cls = classifyTeslaNote(r.title || '');
        if (needTag && cls.modelTag && cls.modelTag !== '未提及') { data.modelTag = cls.modelTag; fixedTag += 1; }
        if (needCat && cls.category) { data.category = cls.category; fixedCat += 1; }
      }
      if (Object.keys(data).length && !DRY) {
        await prisma.koxNote.update({ where: { id: r.id }, data });
      }
    }
    if (scanned % 5000 === 0) console.log(`扫描 ${scanned} ...`);
  }
  console.log(`完成：扫描 ${scanned}；车型标签补齐 ${fixedTag}；内容类型补齐 ${fixedCat}；短标签统一 ${fixedShort}${DRY ? '（dry-run 未写库）' : ''}`);
  await prisma.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
