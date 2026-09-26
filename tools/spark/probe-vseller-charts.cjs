// 基于已知 viewAlias 试探 chart 变体，找子账户投放明细接口
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const state = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-tesla-state.json'), 'utf8'));
const ck = state.cookies
  .filter((c) => /xiaohongshu\.com/.test(c.domain))
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
const URL_ = 'https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list';

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const yesterday = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - 86400000)
  .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

const TARGETS = [
  'virtual_seller_name',
  'virtual_seller_id',
  'cost',
  'imp_cnt',
  'click_cnt',
  'ctr',
  'cpc',
  'interaction_cnt',
  'msg_leads_num',
  'private_msg_leads_num',
  'clue_cnt',
];

function bodyFor(chart, dateStart, dateEnd, extra = {}) {
  return JSON.stringify({
    reportCode: '',
    viewAlias: 'partner_customerManage_monitorAssistant_vsellerMonitorView',
    chart,
    dynamicTargets: TARGETS,
    sorts: [{ sortField: 'cost', sortType: 'desc' }],
    page: { pageNo: 1, pageSize: 20 },
    frontFilterList: [
      { filterField: 'dtm', filterType: 10, timeFilter: { values: [dateStart, dateEnd], pattern: 30, timeShowType: 11, limitMax: 366 } },
    ],
    compFrontFilterList: [],
    ...extra,
  });
}

const pick = (row, code) => {
  const list = row.targetList ?? row.targetVos ?? [];
  const hit = list.find((t) => t.targetCode === code);
  return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
};

(async () => {
  const charts = ['curDayRank', 'curDayTable', 'rankTable', 'monitorTable', 'vsellerTable', 'table', 'vsellerRank', 'dataOverview'];
  for (const chart of charts) {
    for (const [label, s, e] of [
      ['今日', today, today],
      ['昨日', yesterday, yesterday],
    ]) {
      try {
        const r = await fetch(URL_, {
          method: 'POST',
          headers: {
            Cookie: ck,
            'Content-Type': 'application/json',
            'User-Agent': UA,
            Origin: 'https://partner.xiaohongshu.com',
            Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
          },
          body: bodyFor(chart, s, e),
        });
        const j = await r.json().catch(() => ({}));
        const vo = j?.data?.detailListVo ?? {};
        const rows = vo.detailDataList ?? vo.detailVoList ?? [];
        console.log(`${chart} [${label}] code=${j.code} total=${vo.total ?? '-'} rows=${rows.length}`);
        if (rows.length) {
          for (const row of rows.slice(0, 5)) {
            console.log('   ', JSON.stringify({
              seller: pick(row, 'virtual_seller_name'),
              cost: pick(row, 'cost'),
              imp: pick(row, 'imp_cnt'),
              click: pick(row, 'click_cnt'),
            }));
          }
          fs.writeFileSync(path.join(OUT, 'partner-vseller-usable.json'), JSON.stringify({ chart, label, s, e, sample: rows.slice(0, 3) }, null, 1));
          process.exit(0);
        }
      } catch (e) {
        console.log(`${chart} [${label}] ERR ${e.message.slice(0, 60)}`);
      }
    }
  }
  console.log('（全部变体无数据）');
})();
