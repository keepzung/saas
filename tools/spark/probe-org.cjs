// 用登录态探测 MCC 组织信息端点，找出 orgCode
const fs = require('fs');
const path = require('path');
const TAG = process.env.TAG || 'tesla';
const state = JSON.parse(fs.readFileSync(path.join(__dirname, `state/auth-${TAG}.json`), 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, Referer: `${BASE}/micro/home`, 'Content-Type': 'application/json', Origin: BASE };

const GETS = [
  '/api/mcc/account/org/list',
  '/api/mcc/org/list',
  '/api/mcc/user/orgs',
  '/api/mcc/account/info',
  '/api/mcc/user/info',
  '/api/mcc/account/mine',
  '/api/passport/user/info',
];
const POSTS = [
  '/api/mcc/account/org/list',
  '/api/mcc/org/query',
];

(async () => {
  for (const p of GETS) {
    try {
      const r = await fetch(BASE + p, { headers: H });
      const t = await r.text();
      console.log(`GET ${p} -> ${r.status} ${t.slice(0, 260).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`GET ${p} -> ERR ${e.message}`);
    }
  }
  for (const p of POSTS) {
    try {
      const r = await fetch(BASE + p, { method: 'POST', headers: H, body: '{}' });
      const t = await r.text();
      console.log(`POST ${p} -> ${r.status} ${t.slice(0, 260).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`POST ${p} -> ERR ${e.message}`);
    }
  }
  // 无 orgCode 调 rtb：看返回什么（可能报错信息带组织，或用默认组织）
  const r = await fetch(`${BASE}/api/mcc/board/rtb_metrics`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ timeStart: '2026-09-24', timeEnd: '2026-09-24', showStar: false, accountOrgCode: '', accountCode: '', pageIndex: 1, pageSize: 3, tagIds: [], launchStatus: '' }),
  });
  const j = await r.json().catch(() => ({}));
  console.log('rtb empty-org:', r.status, JSON.stringify(j).slice(0, 400));
})();
