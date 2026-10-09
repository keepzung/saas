// 涓€娆℃€у洖濉細浠?KoxJuguangNoteDaily 鑱氬悎閲嶅缓 KoxCampaignDailyStat 鐨?10-02/10-03 鍒嗗尯锛坆rand6锛?// 鍙ｅ緞锛氳仛鍏夋爣鍑嗘姇 12 瀛愯处鎴凤紙fee/impression/click/interaction/msg 涓夐」锛夛紱statDate 绾﹀畾涓烘暟鎹棩闆剁偣锛坣aive锛?const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '../../backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const ID2NAME = {
  '678fa9098cb4da0015f1158b': 'Y25鐗规柉鎷塊OS椤圭洰',
  '68db742440b7020015e49785': '鐗规柉鎷塊OS椤圭洰-鍩虹',
  '69e5ed4657a1ab001598524e': '鐗规柉鎷塊OS椤圭洰-1-鎵樼',
  '6a0bda449ae6330015f7b904': '鐗规柉鎷塊OS椤圭洰-2-Top20',
  '6a69653ab426db0015616701': '鐗规柉鎷塊OS椤圭洰-3-CE',
  '6a7ae1e46242210015ebe050': '鐗规柉鎷塊OS椤圭洰-4-CE琛ュ己',
  '6a7d27f966b399002391955c': '鐗规柉鎷塊OS椤圭洰-7-7鍚嶈窇閲忓皯-1',
  '6a7d2831fe66e50015ca17ca': '鐗规柉鎷塊OS椤圭洰-6-鏂癟op20鎶曟斁璐﹀彿',
  '6a7d38a953dc4600154d04be': '鐗规柉鎷塊OS椤圭洰-5-鎵樼璐﹀彿',
  '6aa10ce634bfab0015bec75f': '鐗规柉鎷塊OS椤圭洰-11-TOP20浼樿川绗旇鏀鹃噺',
  '6aa10cf130c7c8001556598e': '鐗规柉鎷塊OS椤圭洰-10-鎵樼璐﹀彿浼樿川绗旇鏀鹃噺',
  '6aa10cfc34bfab0015bec761': '鐗规柉鎷塊OS椤圭洰-9-3鍚嶆墭绠¤处鍙凤細Leo+灏煎厠+Selina',
};
(async () => {
  for (const day of (process.argv.slice(3).length ? process.argv.slice(3) : ["2026-10-02", "2026-10-03"])) {
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
    console.log(`${day}: 鍐欏叆 ${data.length} 琛? fee 鍚堣 ${Math.round(tot)}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
