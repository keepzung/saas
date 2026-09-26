const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/aurora-data` };
(async () => {
  for (const ps of [5, 100]) {
    const body = { timeStart: '2026-09-25', timeEnd: '2026-09-25', showStar: false, accountOrgCode: '1942550061000474624', accountCode: '', pageIndex: 1, pageSize: ps };
    const r = await fetch(`${BASE}/api/mcc/board/rtb_metrics`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json();
    const d = j.data ?? {};
    console.log(`pageSize=${ps} code=${j.code} total=${d.total} list=${(d.list ?? []).length} keys=${Object.keys(d).join(',')}`);
    const list = d.list ?? [];
    if (list.length) {
      const names = list.map((r2) => r2.brand?.brandUserName ?? '?');
      const df = names.filter((n) => /东风|奕境|YJ-/.test(n));
      console.log('  命中东风/奕境:', df.length, '| 样例:', names.slice(0, 6).join(' | '));
    }
  }
})();