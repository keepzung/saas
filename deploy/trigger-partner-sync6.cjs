// 触发 brand 6 partner 通道同步（借后端 partnerAutoRelogin 刷新 cookie）
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
  const s = await (
    await fetch(`${B}/spark/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ brandId: 6, type: 'campaign' }),
    })
  ).json();
  console.log('sync:', JSON.stringify(s).slice(0, 600));
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
