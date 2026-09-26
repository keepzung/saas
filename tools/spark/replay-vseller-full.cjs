// 重放 virtual_seller 主表（pageSize 拉满），验证特斯拉子账户级投放数据
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
const arr = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-detail-bodies.json'), 'utf8'));
const v = arr.find((x) => /vsellerMonitorV\|virtual_seller/.test(x.key));
const body = v.body;
body.page = { pageNo: 1, pageSize: 50 };

const pick = (row, code) => {
  const list = row.targetList ?? row.targetVos ?? [];
  const hit = list.find((t) => t.targetCode === code);
  return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
};

(async () => {
  const r = await fetch('https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list', {
    method: 'POST',
    headers: {
      Cookie: ck,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Origin: 'https://partner.xiaohongshu.com',
      Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  const vo = j?.data?.detailListVo ?? {};
  const rows = vo.detailDataList ?? vo.detailVoList ?? [];
  console.log('code=' + j.code, 'rows=' + rows.length);
  for (const row of rows) {
    console.log(JSON.stringify({
      seller: pick(row, 'virtual_seller_name'),
      id: String(pick(row, 'virtual_seller_id') ?? '').slice(0, 24),
      status: pick(row, 'status'),
      advertiser: pick(row, 'brand_user_name'),
      yesterday_cost: pick(row, 'pre_1_day_cost'),
      today_cost: pick(row, 'today_cost'),
      week_cost: pick(row, 'week_cost'),
      month_cost: pick(row, 'month_cost'),
      y_imp: pick(row, 'pre_1_day_imp_cnt'),
      y_click: pick(row, 'pre_1_day_click_cnt'),
      y_msg_enter: pick(row, 'pre_1_day_msg_enter_cnt'),
      y_msg_open: pick(row, 'pre_1_day_msg_open_num'),
      y_leads: pick(row, 'pre_1_day_msg_cvr_leads_cnt'),
      operator: pick(row, 'leading_operation_user_name'),
      is_today_put: pick(row, 'is_today_put'),
    }));
  }
  process.exit(0);
})();
