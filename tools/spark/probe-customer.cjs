const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
(async () => {
  const r = await fetch('https://customer.xiaohongshu.com/', { headers: { Cookie: ck, 'User-Agent': UA }, redirect: 'manual' });
  const html = await r.text().catch(() => '');
  console.log('[customer /]', r.status, r.headers.get('location') ?? `len=${html.length}`);
  const ids = [...html.matchAll(/accountOrgCode"?\s*[:=]\s*"?(19\d{16,20}|\d{15,22})"?/g)].map((m) => m[1]);
  const names = [...html.matchAll(/"orgName"\s*:\s*"([^"]{2,30})"/g)].map((m) => m[1]);
  console.log('orgCodes:', [...new Set(ids)].join(', ') || '-');
  console.log('orgNames:', [...new Set(names)].join(', ') || '-');
  for (const p of ['/api/customer/org/list', '/api/org/list', '/api/customer/organizations', '/api/customer/account/list']) {
    try {
      const rr = await fetch('https://customer.xiaohongshu.com' + p, { headers: { Cookie: ck, 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      const t = await rr.text();
      console.log(`[${p}] ${rr.status} ${t.replace(/\s+/g, ' ').slice(0, 250)}`);
    } catch (e) { console.log(`[${p}] ERR ${e.message.slice(0, 50)}`); }
  }
})();