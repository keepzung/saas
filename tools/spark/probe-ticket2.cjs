const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const at = 'AT-68c517689715720277458948kuagpx9syvu5ef27';
const H = { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/home` };
(async () => {
  for (const [label, body, extra] of [
    ['ticket=AT', { ticket: at }, {}],
    ['Authorization Bearer', {}, { Authorization: `Bearer ${at}` }],
    ['at param in body + header', { accessToken: at }, { Authorization: at }],
  ]) {
    const r = await fetch(`${BASE}/api/mcc/organization_v2/get_user_account_list`, { method: 'POST', headers: { ...H, ...extra }, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(`[${label}] ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 800)}\n`);
  }
})();