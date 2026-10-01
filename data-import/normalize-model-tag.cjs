// 车型标签统一带 Model 前缀（历史数据回填，brand6）
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
const MAP = { Y: 'ModelY', YL: 'ModelYL', YP: 'ModelYP', '3P': 'Model3P', X: 'ModelX', S: 'ModelS', 3: 'Model3' };
(async () => {
  let total = 0;
  for (const [from, to] of Object.entries(MAP)) {
    const r = await prisma.koxNote.updateMany({ where: { brandId: 6, modelTag: from }, data: { modelTag: to } });
    total += r.count;
    if (r.count) console.log(`${from} → ${to}: ${r.count}`);
  }
  const dist = await prisma.koxNote.groupBy({ by: ['modelTag'], where: { brandId: 6 }, _count: true });
  console.log('回填合计:', total, '| 现分布:', JSON.stringify(dist.map((d) => ({ m: d.modelTag, c: d._count })).sort((a, b) => b.c - a.c)));
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
