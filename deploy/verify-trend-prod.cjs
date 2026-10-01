// 验证生产 overview trend 是否已被 ranf 补缺（09-01 ~ 09-30）
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
  if (j.code !== 100) throw new Error('login failed ' + JSON.stringify(j).slice(0, 150));
  return j.data.token;
}

(async () => {
  const token = await login();
  const q = 'brandId=6&start=2026-09-01&end=2026-09-30';
  const j = await (await fetch(`${B}/kox/overview?${q}`, { headers: { token } })).json();
  if (j.code !== 100) throw new Error('overview failed ' + JSON.stringify(j).slice(0, 200));
  const trend = j.data?.trend ?? [];
  console.log('trend 天数:', trend.length);
  for (const row of trend.filter((r) => r.date >= '2026-09-22')) {
    console.log(
      row.date,
      'item=', row.item_cnt,
      'exp=', row.exposure_sum,
      'view=', row.view_sum,
      'inter=', row.interaction_sum,
    );
  }
  const gap = trend.filter((r) => r.date >= '2026-09-25' && r.date <= '2026-09-30' && !r.exposure_sum && !r.item_cnt);
  console.log(gap.length ? `仍有 ${gap.length} 天全 0: ${gap.map((g) => g.date).join(',')}` : '✅ 09-25~09-30 曝光/内容已补齐');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
