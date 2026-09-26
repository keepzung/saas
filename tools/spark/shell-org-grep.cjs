const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
(async () => {
  const r = await fetch('https://mcc.xiaohongshu.com/micro/data-monitor', { headers: { Cookie: ck, 'User-Agent': UA } });
  const html = await r.text();
  console.log('status:', r.status, 'len:', html.length);
  const cnt = (t) => (html.match(new RegExp(t, 'g')) || []).length;
  console.log('accountOrgCode hits:', cnt('accountOrgCode'));
  const ids = [...html.matchAll(/accountOrgCode"?\s*[:=]\s*"?(19\d{16,20}|\d{15,22})"?/g)].map((m) => m[1]);
  console.log('orgCodes:', [...new Set(ids)].join(', '));
  const i = html.indexOf('accountOrgCode');
  if (i > -1) console.log('ctx:', html.slice(Math.max(0, i - 200), i + 300).replace(/\s+/g, ' '));
  // 常见组织切换端点
  for (const p of ['/api/mcc/organization/switch_org', '/api/mcc/organization/orgs', '/api/mcc/org/query_user_org', '/api/mcc/organization_v2/query_orgs']) {
    try {
      const rr = await fetch('https://mcc.xiaohongshu.com' + p, { method: 'POST', headers: { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: 'https://mcc.xiaohongshu.com' }, body: '{}' });
      const t = await rr.text();
      console.log(`[${p}] ${rr.status} ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    } catch (e) { console.log(`[${p}] ERR`); }
  }
})();