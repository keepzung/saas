// 最后一搏：organization_v2 get_user_account_list 带 AT/SSO 各种头型尝试
const fs = require('fs');
const path = require('path');
const TAG = (process.env.TAG || 'tesla2').trim();
const state = JSON.parse(fs.readFileSync(path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json'), 'utf8'));
const COOKIE = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
console.log('cookie names:', state.cookies.map((c) => c.name).join(', '));
const AT = 'AT-68c517691202401732132867oztu14aob0sjyy1h';
const PRIMARY = '8965487839';
const BASE = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

const attempt = async (label, p, body, extraHeaders) => {
  try {
    const res = await fetch(`${BASE}${p}`, {
      method: 'POST',
      headers: { Cookie: COOKIE, 'Content-Type': 'application/json', 'User-Agent': UA, Origin: BASE, Referer: `${BASE}/micro/pro-data`, ...extraHeaders },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({ nonJson: res.status }));
    console.log(`[${label}] ${p} -> ${JSON.stringify(j).slice(0, 300)}`);
  } catch (e) {
    console.log(`[${label}] ${p} -> ERR ${e.cause?.code ?? e.message}`);
  }
};

(async () => {
  const bodies = [
    { primaryAccountNo: PRIMARY, page: 1, pageSize: 20 },
    { page: 1, pageSize: 20 },
    {},
  ];
  let i = 0;
  for (const body of bodies) {
    i++;
    await attempt(`at-bearer-${i}`, '/api/mcc/organization_v2/get_user_account_list', body, { Authorization: `Bearer ${AT}` });
    await attempt(`at-header-${i}`, '/api/mcc/organization_v2/get_user_account_list', body, { 'Access-Token': AT });
    await attempt(`at-x-${i}`, '/api/mcc/organization_v2/get_user_account_list', body, { 'X-Access-Token': AT });
  }
  await attempt('at-cookie', '/api/mcc/organization_v2/get_user_account_list', { page: 1, pageSize: 20 }, { Cookie: `${COOKIE}; access_token=${AT}` });
})();
