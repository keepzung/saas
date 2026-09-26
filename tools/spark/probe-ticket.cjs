const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const sso = state.cookies.find((c) => c.name === 'customer-sso-sid')?.value ?? '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/home` };
(async () => {
  for (const [label, body] of [
    ['ticket=sso-sid', { ticket: sso }],
    ['customerClientId', { customer_client_id: state.cookies.find((c) => c.name === 'customerClientId')?.value ?? '' }],
    ['空body', {}],
  ]) {
    const r = await fetch(`${BASE}/api/mcc/organization_v2/get_user_account_list`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(`[${label}] ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 500)}\n`);
  }
  // ticket 换取端点探测
  for (const p of ['/api/mcc/sso/ticket', '/api/mcc/organization_v2/sso_ticket', '/api/mcc/ticket']) {
    const r = await fetch(BASE + p, { method: 'POST', headers: H, body: '{}' });
    console.log(`[${p}] ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 150)}`);
  }
})();