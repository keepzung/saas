// 调 organization_v2 端点拿特斯拉账号的组织列表（orgCode）
const fs = require('fs');
const path = require('path');
const TAG = process.env.TAG || 'tesla';
const state = JSON.parse(fs.readFileSync(path.join(__dirname, `state/auth-${TAG}.json`), 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, Referer: `${BASE}/micro/home`, 'Content-Type': 'application/json', Origin: BASE };

(async () => {
  for (const [label, p, method, body] of [
    ['current/user/v2', '/api/mcc/current/user/v2', 'GET', null],
    ['auth_accounts', '/api/mcc/organization_v2/auth_accounts', 'GET', null],
    ['get_user_account_list', '/api/mcc/organization_v2/get_user_account_list', 'GET', null],
    ['get_user_account_list POST', '/api/mcc/organization_v2/get_user_account_list', 'POST', {}],
    ['role_list', '/api/mcc/organization_v2/role_list', 'GET', null],
  ]) {
    try {
      const r = await fetch(BASE + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      console.log(`[${label}] ${r.status} ${t.slice(0, 700).replace(/\s+/g, ' ')}`);
      console.log('');
    } catch (e) {
      console.log(`[${label}] ERR ${e.message}`);
    }
  }
})();
