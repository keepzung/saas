// 10-03 投放回补前置诊断：brand6 主表分区 + 子账号身份映射（只读）
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const parts = await p.$queryRawUnsafe(`SELECT "statDate", COUNT(*) rows FROM "KoxCampaignDailyStat" WHERE "brandId"=6 AND "statDate" >= '2026-09-28' GROUP BY 1 ORDER BY 1`);
  console.log('=== brand6 主表分区 ===');
  for (const r of parts) console.log(`  ${new Date(r.statDate).toISOString()} rows=${r.rows}`);
  const ids = await p.$queryRawUnsafe(`SELECT DISTINCT "virtualSellerId", "brandUserName" FROM "KoxCampaignDailyStat" WHERE "brandId"=6 AND "statDate" >= '2026-10-03' LIMIT 15`);
  console.log('=== 子账号身份（10-3 后的行）===');
  for (const r of ids) console.log(`  ${r.virtualSellerId}  ${r.brandUserName}`);
  const vs = await p.$queryRawUnsafe(`SELECT DISTINCT "vSeller" FROM "KoxJuguangNoteDaily" WHERE "brandId"=6`);
  console.log('=== note-daily vSeller IDs ===');
  console.log(vs.map((x) => x.vSeller).join('\n'));
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
