// 客户「特斯拉投放数据源」日合计 JSON → KoxCampaignDailyStat 历史缺口回补 (服务器运行)
// 用法:
//   node tesla-adsource-import.cjs <days.json>            # 干跑: 只打印计划, 不写库
//   node tesla-adsource-import.cjs <days.json> --apply    # 执行: 删坏值日 + upsert 补数行
// 规则:
//   对 JSON 里每个日: 对比库内 partner_vseller 当日 sum(fee) vs JSON fee
//   - 库内无行            → upsert 一行聚合补数 (virtualSellerId='excel-backfill')
//   - |库-JSON| <= 100 元 → 跳过 (实时快照已与客户一致)
//   - 差异 > 100 元       → 删当日全部 partner_vseller 行, 换成聚合补数行
//   - day >= 昨天         → 一律跳过 (实时管道正在写 D/D-1, 不抢)
// 幂等: 唯一键 (statDate, virtualSellerId), 重跑安全
// 客户新文件到达时的更新流程: 本地 py data-import/tesla-adsource-export.py <xlsx> days.json
//   → scp 到服务器 → node ... --apply
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');

const jsonFile = process.argv[2];
const apply = process.argv.includes('--apply');
const BRAND_ID = 6;
const KIND = 'partner_vseller';
const VS_ID = 'excel-backfill';
const TOLERANCE = 100; // 元, 实时快照 vs 客户文件的正常时点误差
const VS_NAME = '客户数据源补数';

if (!jsonFile) {
  console.error(__doc__ || '用法: node tesla-adsource-import.cjs <days.json> [--apply]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

(async () => {
  const p = new PrismaClient();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - 86400_000; // yesterday 00:00 UTC
  const plan = [];
  for (const d of data.days) {
    const statDate = new Date(`${d.day}T00:00:00Z`);
    if (statDate.getTime() >= cutoff) { plan.push({ day: d.day, action: 'skip-recent' }); continue; }
    const agg = await p.koxCampaignDailyStat.aggregate({
      where: { brandId: BRAND_ID, accountKind: KIND, statDate },
      _sum: { fee: true }, _count: { _all: true },
    });
    const dbFee = Number(agg._sum.fee ?? 0);
    const jFee = Number(d.fee);
    if (agg._count._all === 0) plan.push({ day: d.day, action: 'insert', dbFee, jFee, d });
    else if (Math.abs(dbFee - jFee) <= TOLERANCE) plan.push({ day: d.day, action: 'skip-ok', dbFee, jFee });
    else plan.push({ day: d.day, action: 'replace', dbFee, jFee, d });
  }

  console.log(`日合计 ${plan.length} 天: `);
  for (const it of plan) {
    const mark = { insert: '+', replace: '!', 'skip-ok': '=', 'skip-recent': '-' }[it.action];
    if (it.action === 'skip-recent') console.log(`  ${mark} ${it.day}  太新, 留给实时管道`);
    else if (it.action === 'skip-ok') console.log(`  ${mark} ${it.day}  已一致 (库 ${it.dbFee.toFixed(2)} ≈ 客户 ${it.jFee.toFixed(2)})`);
    else console.log(`  ${mark} ${it.day}  ${it.action === 'insert' ? '缺' : `坏值 库 ${it.dbFee.toFixed(2)}`} → 客户 ${it.jFee.toFixed(2)} (差 ${(it.jFee - it.dbFee).toFixed(2)}), ${it.action === 'replace' ? '删旧行+' : ''}写聚合行 [${it.d.rows} 行笔记, 展现 ${it.d.impression}]`);
  }

  if (!apply) {
    console.log('干跑结束 (--apply 执行)');
    await p.$disconnect();
    return;
  }

  let ins = 0, rep = 0;
  for (const it of plan) {
    if (it.action !== 'insert' && it.action !== 'replace') continue;
    const statDate = new Date(`${it.day}T00:00:00Z`);
    await p.$transaction([
      p.koxCampaignDailyStat.deleteMany({ where: { brandId: BRAND_ID, accountKind: KIND, statDate } }),
      p.koxCampaignDailyStat.create({
        data: {
          brandId: BRAND_ID, statDate, virtualSellerId: VS_ID, advertiserId: VS_ID,
          brandUserName: VS_NAME, accountKind: KIND,
          fee: it.d.fee, impression: it.d.impression, click: it.d.click,
          interaction: it.d.interaction,
          messageConsult: it.d.msgInquiries, msgChatUserCnt: it.d.msgOpenings, msgLeadsNum: it.d.msgLeads,
          rawJson: { source: data.source_file, noteRows: it.d.rows, importedAt: new Date().toISOString() },
        },
      }),
    ]);
    it.action === 'insert' ? ins++ : rep++;
  }
  console.log(`已应用: 新增 ${ins} 天, 替换 ${rep} 天`);
  await p.$disconnect();
})().catch((e) => {
  console.error(`导入失败: ${e.message}`);
  process.exit(1);
});
