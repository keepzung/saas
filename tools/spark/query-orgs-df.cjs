const fs = require('fs');
const path = require('path');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, Referer: `${BASE}/micro/home`, 'Content-Type': 'application/json', Origin: BASE };
(async () => {
  const me = await fetch(`${BASE}/api/mcc/current/user/v2`, { headers: H }).then((r) => r.json());
  const u = me?.data ?? {};
  console.log('[me]', u.accountNo ?? u.nickname ?? u.username ?? JSON.stringify(u).slice(0, 120), '| org:', u.accountOrgCode ?? '-', u.accountOrgName ?? '');
  for (const [label, p, method, body] of [
    ['auth_accounts', '/api/mcc/organization_v2/auth_accounts', 'GET', null],
    ['get_user_account_list GET', '/api/mcc/organization_v2/get_user_account_list', 'GET', null],
    ['get_user_account_list POST', '/api/mcc/organization_v2/get_user_account_list', 'POST', {}],
    ['account_list', '/api/mcc/organization_v2/account_list', 'GET', null],
    ['org_list', '/api/mcc/organization_v2/org_list', 'GET', null],
  ]) {
    try {
      const r = await fetch(BASE + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      console.log(`[${label}] ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 900)}`);
    } catch (e) { console.log(`[${label}] ERR ${e.message}`); }
  }
})();