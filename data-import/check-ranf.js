// 快速检查 ranf 数据覆盖情况
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const ranf = await prisma.koxRanfDaily.findMany({
    orderBy: { day: 'asc' },
    select: { brandId: true, day: true, fee: true, impression: true, click: true, noteCnt: true },
  });
  console.log(`KoxRanfDaily 共 ${ranf.length} 天`);
  for (const r of ranf) {
    const d = new Date(r.day.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    console.log(`  brand=${r.brandId} ${d} fee=${r.fee} imp=${r.impression} click=${r.click} notes=${r.noteCnt}`);
  }
  const logs = await prisma.sparkSyncLog.findMany({ orderBy: { id: 'desc' }, take: 8 });
  console.log('\nSparkSyncLog 最近:');
  for (const l of logs) {
    console.log(`  #${l.id} brand=${l.brandId} ${l.syncType} ${l.statDate.toISOString().slice(0, 10)} fetched=${l.fetched} upserted=${l.upserted}`);
    console.log(`    ${l.message}`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
