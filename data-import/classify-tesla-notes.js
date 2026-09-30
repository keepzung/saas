// 特斯拉笔记一次性分类回填（brandId=6，category/modelTag 为空的行按标题规则填充）
// 用法: node classify-tesla-notes.js [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const { classifyTeslaNote } = require(path.join(ROOT, 'backend/src/common/note-classify.ts'));

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

(async () => {
  const where = { brandId: 6, OR: [{ category: null }, { modelTag: null }] };
  const total = await prisma.koxNote.count({ where });
  console.log(`待分类笔记: ${total}`);
  const pageSize = 500;
  let scanned = 0;
  let catFilled = 0;
  let modelFilled = 0;
  const dist = {};
  for (let skip = 0; skip < total; skip += pageSize) {
    const rows = await prisma.koxNote.findMany({
      where,
      select: { id: true, title: true, category: true, modelTag: true },
      skip,
      take: pageSize,
    });
    for (const r of rows) {
      const { category, modelTag } = classifyTeslaNote(r.title);
      const data = {};
      if (!r.category) {
        data.category = category;
        catFilled++;
      }
      if (!r.modelTag) {
        data.modelTag = modelTag;
        modelFilled++;
      }
      dist[category] = (dist[category] ?? 0) + 1;
      if (!DRY_RUN && Object.keys(data).length) {
        await prisma.koxNote.update({ where: { id: r.id }, data });
      }
      scanned++;
    }
    if (skip % 5000 === 0) console.log(`progress: ${scanned}/${total}`);
  }
  console.log(`完成: scanned=${scanned} categoryFilled=${catFilled} modelFilled=${modelFilled}`);
  console.log('内容分布:', JSON.stringify(dist));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
