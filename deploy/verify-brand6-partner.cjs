// 生产 brand=6 partner 通道验证：同步 + 汇总
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
  const h = { token };
  const st = await (await fetch(`${B}/spark/status?brandId=6`, { headers: h })).json();
  console.log('brand6 status:', JSON.stringify({
    cookie_valid: st.data?.cookie_valid,
    channel: (st.data?.orgs ?? []).find((o) => o.brand_id === 6)?.channel,
  }));
  const s = await (
    await fetch(`${B}/spark/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ type: 'campaign', brandId: 6 }),
    })
  ).json();
  console.log('sync6:', JSON.stringify(s.data ?? s).slice(0, 260));
  const sm = await (
    await fetch(`${B}/spark/campaign/summary?brandId=6&start=2026-09-25&end=2026-09-26`, { headers: h })
  ).json();
  console.log('summary:', JSON.stringify(sm.data?.summary));
  console.log('trend:', JSON.stringify(sm.data?.trend));
  const ac = await (
    await fetch(`${B}/spark/campaign/accounts?brandId=6&page_size=5`, { headers: h })
  ).json();
  console.log('accounts top:', (ac.data?.list ?? []).map((x) => `${x.name}/${x.fee}`).join(' | '));
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
