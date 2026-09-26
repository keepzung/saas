const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/aurora-data` };
(async () => {
  const all = [];
  for (let page = 1; page <= 4; page++) {
    const body = { timeStart: '2026-09-25', timeEnd: '2026-09-25', showStar: false, accountOrgCode: '1942550061000474624', accountCode: '', pageIndex: page, pageSize: 100 };
    const r = await fetch(`${BASE}/api/mcc/board/rtb_metrics`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json();
    const list = j.data?.rtbAccountMetricsVos ?? [];
    all.push(...list);
    if (all.length >= (j.data?.total ?? 0) || !list.length) break;
  }
  console.log('total rows:', all.length);
  const names = all.map((r) => r.brand?.brandUserName ?? r.accountName ?? JSON.stringify(r.brand).slice(0, 40));
  const df = names.filter((n) => /东风|奕境|YJ-/.test(n));
  console.log('东风/奕境 命中:', df.length);
  console.log('命中名:', df.slice(0, 15).join(' | ') || '-');
  console.log('样例:', names.slice(0, 10).join(' | '));
  // 保存全量名与 UID 供后续核对
  fs.writeFileSync('tools/spark/state/org-roewe-accounts.json', JSON.stringify(all.map((r) => ({ id: r.brand?.brandUserId ?? r.accountId ?? null, name: r.brand?.brandUserName ?? null })), null, 1));
})();