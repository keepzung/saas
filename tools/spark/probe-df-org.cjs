const fs = require('fs');
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
console.log('cookies:', state.cookies.map((c) => c.name).join(', '));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const probe = async (label, org) => {
  const body = { timeStart: '2026-09-25', timeEnd: '2026-09-25', showStar: false, accountOrgCode: org, accountCode: '', pageIndex: 1, pageSize: 5 };
  try {
    const r = await fetch(`${BASE}/api/mcc/board/rtb_metrics`, { method: 'POST', headers: { Cookie: ck, 'User-Agent': UA, 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/micro/aurora-data` }, body: JSON.stringify(body) });
    const j = await r.json();
    const first = j.data?.list?.[0];
    console.log(`[${label}] ${r.status} code=${j.code} total=${j.data?.total ?? '-'} first=${first ? (first.brand?.brandUserName ?? first.brand?.brandUserId ?? '?') : '-'}`);
  } catch (e) { console.log(`[${label}] ERR ${e.message}`); }
};
(async () => {
  await probe('荣威org', '1942550061000474624');
  await probe('默认org', '');
})();