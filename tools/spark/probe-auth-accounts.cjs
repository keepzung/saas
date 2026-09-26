const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const at = 'AT-68c517689715720277458948kuagpx9syvu5ef27';
const sso = state.cookies.find((c) => c.name === 'customer-sso-sid')?.value ?? '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/home` };
(async () => {
  for (const [label, body] of [
    ['auth_accounts POST {}', {}],
    ['auth_accounts POST {ticket:AT}', { ticket: at }],
    ['auth_accounts POST {ticket:sso}', { ticket: sso }],
    ['get_user_account_list {ticket:sso}', { ticket: sso }],
    ['role_list POST {}', null],
  ]) {
    try {
      const r = await fetch(`${BASE}/api/mcc/organization_v2/auth_accounts`, { method: 'POST', headers: H, body: JSON.stringify(body) });
      const t = await r.text();
      console.log(`[${label}] ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 400)}`);
    } catch (e) { console.log(`[${label}] ERR`); }
  }
})();