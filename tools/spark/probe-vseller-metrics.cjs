// 拉 target_config_list 找指标码 → 构造子账户级投放明细查询
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
const BASE = 'https://partner.xiaohongshu.com';
const H = {
  Cookie: ck,
  'Content-Type': 'application/json',
  'User-Agent': UA,
  Origin: BASE,
  Referer: `${BASE}/partner/watch-dashboard`,
};
const VIEW = 'partner_customerManage_monitorAssistant_vsellerMonitorView';

const pick = (row, code) => {
  const list = row.targetList ?? row.targetVos ?? [];
  const hit = list.find((t) => t.targetCode === code);
  return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
};

(async () => {
  // 1) 拉指标配置
  let cfg = null;
  for (const body of [JSON.stringify({ viewAlias: VIEW }), '{}']) {
    const r = await fetch(`${BASE}/api/vision/dashboard/target_config_list`, { method: 'POST', headers: H, body });
    const j = await r.json().catch(() => ({}));
    if (j?.data?.targetConfigListVo) {
      cfg = j.data.targetConfigListVo;
      break;
    }
  }
  if (!cfg) {
    console.log('target_config_list 拉取失败');
    process.exit(1);
  }
  const codes = [];
  for (const g of cfg.dimGroupList ?? []) {
    for (const t of g.targetList ?? []) codes.push({ code: t.targetCode, name: t.targetName, group: g.groupName ?? g.dimName ?? '' });
  }
  console.log('可用指标/维度总数:', codes.length);
  const wanted = codes.filter((c) =>
    /^(cost|imp_cnt|click_cnt|ctr|cpc|cpm|interaction_cnt|msg_leads_num|private_msg_leads_num|clue_cnt|like_cnt|cmt_cnt|fav_cnt|share_cnt|follow_cnt|)/.test(c.code) ||
    /消耗|曝光|点击|私信|留资|互动/.test(c.name),
  );
  for (const c of wanted.slice(0, 40)) console.log('  ', c.code, '=>', c.name);

  // 2) 构造子账户查询（今日 + 昨日各一次）
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const yesterday = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - 86400000)
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  const metricCodes = wanted.map((c) => c.code);
  const query = {
    reportCode: '',
    viewAlias: VIEW,
    chart: 'virtual_seller',
    dynamicTargets: ['virtual_seller_name', 'virtual_seller_id', ...metricCodes],
    sorts: [{ sortField: metricCodes.includes('cost') ? 'cost' : metricCodes[1], sortType: 'desc' }],
    page: { pageNo: 1, pageSize: 30 },
    frontFilterList: [
      { filterField: 'dtm', filterType: 10, timeFilter: { values: [yesterday, yesterday], pattern: 30, timeShowType: 11, limitMax: 366 } },
    ],
    compFrontFilterList: [],
  };
  const r = await fetch(`${BASE}/api/vision/dashboard/target_detail_list`, { method: 'POST', headers: H, body: JSON.stringify(query) });
  const j = await r.json().catch(() => ({}));
  const vo = j?.data?.detailListVo ?? {};
  const rows = vo.detailDataList ?? vo.detailVoList ?? [];
  console.log('\n[子账户×昨日] code=' + j.code, 'rows=' + rows.length);
  for (const row of rows.slice(0, 12)) {
    console.log('  ', JSON.stringify({
      seller: pick(row, 'virtual_seller_name'),
      cost: pick(row, 'cost'),
      imp: pick(row, 'imp_cnt'),
      click: pick(row, 'click_cnt'),
      leads: pick(row, 'msg_leads_num') ?? pick(row, 'private_msg_leads_num'),
    }));
  }
  fs.writeFileSync(path.join(OUT, 'partner-vseller-query.json'), JSON.stringify({ query, rows: rows.slice(0, 30) }, null, 1));
  process.exit(0);
})();
