// org 探测：dump user/v2 全量 + 扫一批候选组织端点
const fs = require('fs');
const path = require('path');
const TAG = (process.env.TAG || 'tesla2').trim();
const state = JSON.parse(fs.readFileSync(path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json'), 'utf8'));
const COOKIE = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: COOKIE, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/126.0.0.0' };

const call = async (p, body, method = 'POST') => {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: H,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const j = await res.json().catch(() => ({ nonJson: res.status }));
  return j;
};
const walk = (v, hits) => {
  if (!v) return;
  if (Array.isArray(v)) return v.forEach((x) => walk(x, hits));
  if (typeof v === 'object') {
    if (v.accountOrgCode || v.orgCode || v.account_org_code || v.orgId) {
      hits.push(JSON.stringify(v).slice(0, 260));
    }
    Object.values(v).forEach((x) => walk(x, hits));
  }
};

(async () => {
  const me = await call('/api/mcc/current/user/v2', {}, 'GET');
  console.log('=== user/v2 full ===');
  console.log(JSON.stringify(me).slice(0, 2000));

  const endpoints = [
    ['/api/mcc/current/org', 'GET'],
    ['/api/mcc/current/org/list', 'GET'],
    ['/api/mcc/org/list', 'POST'],
    ['/api/mcc/org/listpage', 'POST'],
    ['/api/mcc/org/my_orgs', 'POST'],
    ['/api/mcc/account/org/list', 'POST'],
    ['/api/mcc/org/get_org_list', 'POST'],
    ['/api/mcc/organization/list', 'POST'],
    ['/api/mcc/organization_v2/list', 'POST'],
    ['/api/mcc/organization_v2/get_org_list', 'POST'],
    ['/api/mcc/organization_v2/role_list', 'POST'],
    ['/api/mcc/organization_v2/auth_accounts', 'POST'],
    ['/api/mcc/staff/mine', 'GET'],
    ['/api/mcc/current/mine', 'GET'],
  ];
  for (const [p, m] of endpoints) {
    const j = await call(p, {}, m).catch(() => null);
    if (!j || j.nonJson) { console.log(`${m} ${p} -> non-json`); continue; }
    const hits = [];
    walk(j, hits);
    const brief = JSON.stringify(j);
    console.log(`${m} ${p} -> code=${j.code} len=${brief.length} orgHits=${hits.length}${hits.length ? '\n    ' + hits.join('\n    ') : ''}`);
  }
})().catch((e) => { console.error('FAIL', e.message); });
