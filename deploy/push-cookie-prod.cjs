// 生产 cookie 更新：POST /spark/cookie（DB+运行时即时生效）+ 同步 .env + 状态校验
// 服务器执行：/root/.nvm/versions/node/v22.22.2/bin/node push-cookie-prod.cjs
const fs = require('fs');
const crypto = require('crypto');

const BASE = 'http://127.0.0.1:3000/api/agency-api';
const USER = '18510234580';
const PASS = process.env.PROD_ADMIN_PASSWORD || 'Marketine@2026';

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

async function login() {
  const r = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: sha1(PASS) }),
  });
  const j = await r.json();
  if (j.code === 100) return j.data.token;
  if (j.code === 10015) {
    const uid = j.data.user_id;
    const c = await (await fetch(`${BASE}/getcompanybyuserid?user_id=${uid}`)).json();
    const target = c.data.find((x) => x.admin_flag === 1) ?? c.data[0];
    const r2 = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: USER,
        password: sha1(PASS),
        main_company_id: String(target.main_company_id),
      }),
    });
    const j2 = await r2.json();
    if (j2.code !== 100) throw new Error('relogin failed: ' + JSON.stringify(j2).slice(0, 200));
    return j2.data.token;
  }
  throw new Error('login failed: ' + JSON.stringify(j).slice(0, 200));
}

(async () => {
  const cookie = fs.readFileSync('/tmp/spark-cookie.txt', 'utf8').trim();
  if (cookie.length < 700) throw new Error('cookie file suspicious, len=' + cookie.length);
  const token = await login();
  const r = await fetch(`${BASE}/spark/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ cookie }),
  });
  console.log('POST /spark/cookie:', (await r.text()).slice(0, 200));

  let env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  if (/^SPARK_COOKIE=/m.test(env)) env = env.replace(/^SPARK_COOKIE=.*$/m, `SPARK_COOKIE=${cookie}`);
  else env += `\nSPARK_COOKIE=${cookie}\n`;
  fs.writeFileSync('/opt/saas/backend/.env', env);
  console.log('.env updated');

  await new Promise((res) => setTimeout(res, 3000));
  const st = await (await fetch(`${BASE}/spark/status`, { headers: { token } })).json();
  console.log('status:', JSON.stringify({
    cookie_configured: st.data?.cookie_configured,
    cookie_valid: st.data?.cookie_valid,
    latest_calculate_date: st.data?.latest_calculate_date,
    accounts: st.data?.accounts,
    orgs: (st.data?.orgs ?? []).map((o) => o.brand_id),
  }));
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
