const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA };
(async () => {
  for (const p of ['/api/mcc/current/user/v2', '/api/mcc/current/user', '/api/mcc/user/info']) {
    try {
      const r = await fetch(BASE + p, { headers: H });
      const t = await r.text();
      console.log(`[${p}] ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 1000)}\n`);
    } catch (e) { console.log(`[${p}] ERR ${e.message}`); }
  }
})();