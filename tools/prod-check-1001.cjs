// 生产库 10-01/10-02 数据源验证（只读）
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const clue = await p.$queryRawUnsafe(`SELECT ("day" AT TIME ZONE 'UTC')::date d, COUNT(*) n, SUM(CASE WHEN entered THEN 1 ELSE 0 END) entered FROM "ProClueUserDay" WHERE "brandId"=6 AND "day" >= '2026-09-30' GROUP BY 1 ORDER BY 1`);
  console.log('=== ProClueUserDay (私信, brand6) ===');
  for (const r of clue) console.log(`  ${r.d.toISOString().slice(0, 10)}  ${r.n} rows, entered=${r.entered}`);
  const camp = await p.$queryRawUnsafe(`SELECT MAX("statDate") m FROM "KoxCampaignDailyStat" WHERE "brandId"=6`);
  console.log(`=== KoxCampaignDailyStat max: ${camp[0].m?.toISOString?.()}`);
  const staff = await p.$queryRawUnsafe(`SELECT "dateType", MAX("statDate") m, COUNT(*) n FROM "ProKosStaff" WHERE "brandId"=6 GROUP BY 1 ORDER BY 1`);
  console.log('=== ProKosStaff 分区 ===');
  for (const r of staff) console.log(`  dateType=${r.dateType} max=${r.m?.toISOString?.()} rows=${r.n}`);
  const notes = await p.$queryRawUnsafe(`SELECT ("publishTime" AT TIME ZONE 'UTC')::date d, COUNT(*) n FROM "KoxNote" WHERE "brandId"=6 AND "publishTime" >= '2026-09-29' GROUP BY 1 ORDER BY 1`);
  console.log('=== KoxNote 按发布日 ===');
  for (const r of notes) console.log(`  ${r.d.toISOString().slice(0, 10)}  ${r.n} rows`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
