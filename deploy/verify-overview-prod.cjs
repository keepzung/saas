// 验证生产 overview：账号基线/大区筛选/汇总/趋势/线索
const crypto = require('crypto');
const B = 'http://127.0.0.1:3000/api/agency-api';
const USER = '18510234580';
const PASS = process.env.PROD_ADMIN_PASSWORD || 'Marketine@2026';
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

async function login() {
  let r = await fetch(`${B}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: sha1(PASS) }),
  });
  let j = await r.json();
  if (j.code === 10015) {
    const c = await (await fetch(`${B}/getcompanybyuserid?user_id=${j.data.user_id}`)).json();
    const t = c.data.find((x) => x.admin_flag === 1) || c.data[0];
    r = await fetch(`${B}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: sha1(PASS), main_company_id: String(t.main_company_id) }),
    });
    j = await r.json();
  }
  if (j.code !== 100) throw new Error('login failed');
  return j.data.token;
}

(async () => {
  const token = await login();
  const H = { token };
  const acc = await (await fetch(`${B}/kox/accounts?brandId=6&page_size=1`, { headers: H })).json();
  console.log('region_facets:', JSON.stringify(acc.data?.region_facets));
  const ov = await (await fetch(`${B}/kox/overview?brandId=6&start=2026-09-26&end=2026-10-02`, { headers: H })).json();
  const d = ov.data ?? {};
  console.log('kos_num(global):', d.global?.kos_num, 'store_num:', d.global?.store_num, 'fans:', d.global?.fans_sum);
  console.log('summary:', JSON.stringify({
    kos: d.summary?.kos_num, item: d.summary?.item_cnt, exp: d.summary?.exposure_sum,
    view: d.summary?.view_sum, follow: d.summary?.follow_count_sum, ctr: d.summary?.ctr,
  }));
  console.log('lead_funnel source:', d.lead_funnel?.source, 'enter:', d.lead_funnel?.pm_inquiries, 'leads:', d.lead_funnel?.pm_leads, 'total:', d.lead_funnel?.total_leads);
  const trend = d.trend ?? [];
  const sample = trend.filter((r) => ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].includes(r.date));
  for (const r of sample) {
    console.log('trend', r.date, 'item=', r.item_cnt, 'exp=', r.exposure_sum, 'inter=', r.interaction_sum, 'ad_inq=', r.ad_msg_enter, 'ad_leads=', r.ad_msg_leads);
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
