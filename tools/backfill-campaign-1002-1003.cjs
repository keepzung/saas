// 一次性回填：从 KoxJuguangNoteDaily 聚合重建 KoxCampaignDailyStat 的 10-02/10-03 分区（brand6）
// 口径：聚光标准投 12 子账户（fee/impression/click/interaction/msg 三项）；statDate 约定为数据日零点（naive）
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '../../backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const ID2NAME = {
  '678fa9098cb4da0015f1158b': 'Y25特斯拉KOS项目',
  '68db742440b7020015e49785': '特斯拉KOS项目-基础',
  '69e5ed4657a1ab001598524e': '特斯拉KOS项目-1-托管',
  '6a0bda449ae6330015f7b904': '特斯拉KOS项目-2-Top20',
  '6a69653ab426db0015616701': '特斯拉KOS项目-3-CE',
  '6a7ae1e46242210015ebe050': '特斯拉KOS项目-4-CE补强',
  '6a7d27f966b399002391955c': '特斯拉KOS项目-7-7名跑量少-1',
  '6a7d2831fe66e50015ca17ca': '特斯拉KOS项目-6-新Top20投放账号',
  '6a7d38a953dc4600154d04be': '特斯拉KOS项目-5-托管账号',
  '6aa10ce634bfab0015bec75f': '特斯拉KOS项目-11-TOP20优质笔记放量',
  '6aa10cf130c7c8001556598e': '特斯拉KOS项目-10-托管账号优质笔记放量',
  '6aa10cfc34bfab0015bec761': '特斯拉KOS项目-9-3名托管账号：Leo+尼克+Selina',
};
(async () => {
  for (const day of ['2026-10-02', '2026-10-03']) {
    const rows = await p.$queryRawUnsafe(`
      SELECT "vSeller", COALESCE(SUM(fee),0) fee, COALESCE(SUM(impression),0) imp, COALESCE(SUM(click),0) click,
             COALESCE(SUM(interaction),0) inter, COALESCE(SUM("msgLeads"),0) leads,
             COALESCE(SUM("msgInquiries"),0) inq, COALESCE(SUM("msgOpenings"),0) open
      FROM "KoxJuguangNoteDaily" WHERE "brandId"=6
        AND "day" >= ($1 || ' 16:00:00')::timestamp AND "day" < ($1 || ' 16:00:00')::timestamp + interval '1 day'
      GROUP BY 1`, day);
    await p.$executeRawUnsafe(`DELETE FROM "KoxCampaignDailyStat" WHERE "brandId"=6 AND "statDate" = ($1 || ' 00:00:00')::timestamp`, day);
    const data = [];
    for (const [vs, name] of Object.entries(ID2NAME)) {
      const r = rows.find((x) => x.vSeller === vs);
      data.push({
        statDate: new Date(`${day}T00:00:00+08:00`), brandId: 6,
        virtualSellerId: vs, brandUserName: name, advertiserId: '', accountKind: 'juguang_backfill',
        fee: r ? Math.round(Number(r.fee) * 100) / 100 : 0,
        impression: r ? Number(r.imp) : 0, click: r ? Number(r.click) : 0,
        interaction: r ? Number(r.inter) : 0,
        msgLeadsNum: r ? Number(r.leads) : 0, leads: r ? Number(r.leads) : 0,
        messageConsult: r ? Number(r.inq) : 0, msgChatUserCnt: r ? Number(r.open) : 0,
        rawJson: { source: 'juguang_note_daily_backfill' },
      });
    }
    await p.koxCampaignDailyStat.createMany({ data });
    const tot = data.reduce((s, x) => s + x.fee, 0);
    console.log(`${day}: 写入 ${data.length} 行, fee 合计 ${Math.round(tot)}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
