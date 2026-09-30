// 纯 fetch 版 MCC 权限诊断（绕开浏览器 SPA 加载超时）：user → org 枚举 → rtb → noteList
// 用法: TAG=tesla2 node diag-tesla-mcc-fetch.cjs [orgCode]
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const ORG_ARG = process.argv[2] || process.env.ORG || '';
const state = JSON.parse(fs.readFileSync(path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json'), 'utf8'));
const COOKIE = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: COOKIE, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36' };

const call = async (p, body, method = 'POST') => {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: H,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return res.json().catch(() => ({ nonJson: true, status: res.status }));
};

const walk = (v, hits) => {
  if (!v) return;
  if (Array.isArray(v)) return v.forEach((x) => walk(x, hits));
  if (typeof v === 'object') {
    if (v.accountOrgCode || v.orgCode || v.account_org_code) {
      hits.push({
        orgCode: String(v.accountOrgCode ?? v.orgCode ?? v.account_org_code),
        name: v.accountOrgName ?? v.orgName ?? v.name ?? '',
      });
    }
    Object.values(v).forEach((x) => walk(x, hits));
  }
};

(async () => {
  // 1) 账号识别
  const me = await call('/api/mcc/current/user/v2', {}, 'GET').catch((e) => ({ err: String(e) }));
  console.log(`[1] user: code=${me?.code} nickname=${me?.data?.nickname ?? me?.data?.name} accountNo=${me?.data?.accountNo ?? me?.data?.account_no} roles=${JSON.stringify(me?.data?.roles)}`);

  // 2) org 枚举（多端点尝试）
  let orgs = [];
  for (const [p, body] of [
    ['/api/mcc/org/get_user_account_list', { page: 1, pageSize: 20 }],
    ['/api/mcc/current/orgs', {}],
    ['/api/mcc/org/auth_accounts', {}],
    ['/api/mcc/organization_v2/get_user_account_list', {}],
  ]) {
    const j = await call(p, body).catch(() => null);
    if (j && !j.nonJson) {
      const before = orgs.length;
      walk(j, orgs);
      if (orgs.length > before) console.log(`[2] ${p} 命中 ${orgs.length - before} 个组织`);
    }
  }
  orgs = orgs.filter((o, i, a) => a.findIndex((x) => x.orgCode === o.orgCode) === i);
  console.log(`[2] 组织列表: ${JSON.stringify(orgs)}`);

  const org = ORG_ARG || orgs[0]?.orgCode;
  if (!org) {
    console.log('[2] !! 无 orgCode —— 请在 MCC 后台 F12 抓 accountOrgCode 后重跑：node diag-tesla-mcc-fetch.cjs <orgCode>');
    process.exit(2);
  }
  console.log(`[2] 使用 org=${org}`);

  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const end = fmt(today);
  const start = fmt(new Date(today.getTime() - 6 * 86400000));

  // 3) 投放
  const rtb = await call('/api/mcc/board/rtb_metrics', {
    timeStart: `${start} 00:00:00`,
    timeEnd: `${end} 23:59:59`,
    accountOrgCode: org,
    pageIndex: 1,
    pageSize: 5,
  });
  const rtbList = rtb?.data?.rtbAccountMetricsVos ?? rtb?.data?.list ?? [];
  const feeSum = rtbList.reduce((s, r) => s + Number(r.fee ?? r.totalFee ?? 0), 0);
  console.log(`[3] 投放 rtb: code=${rtb?.code} msg=${rtb?.msg} 账户数=${rtb?.data?.total ?? rtbList.length} 近7日消耗≈${feeSum.toFixed(2)}`);
  console.log(`    样例: ${JSON.stringify(rtbList.slice(0, 3).map((r) => ({ name: r.sellerName ?? r.name, fee: r.fee ?? r.totalFee })))}`);

  // 4) 笔记
  const notes = await call('/api/vision/mcc_dashboard/target_detail_list', {
    viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
    chart: 'noteList',
    accountOrgCode: org,
    dynamicTargets: [],
    frontFilterList: [
      { type: 10, filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, values: [`${start} 00:00:00`, `${end} 23:59:59`] } },
    ],
    pageIndex: 1,
    pageSize: 5,
  });
  const nRows = notes?.data?.detailDataList ?? notes?.data?.detailVoList ?? notes?.data?.targetList ?? [];
  console.log(`[4] 笔记 noteList: code=${notes?.code} msg=${notes?.msg} total=${notes?.data?.total ?? nRows.length}`);
  console.log(`    样例: ${JSON.stringify(nRows.slice(0, 3).map((r) => ({ title: (r.note_title ?? r.title ?? '').slice(0, 24), author: r.author_name ?? r.authorName })))}`);

  console.log('\n==== 结论 ====');
  console.log((rtb?.data?.total ?? rtbList.length) > 0 ? '[投放] OK' : '[投放] 空（无聚光账户/无权限/T+1 未回流）');
  console.log((notes?.data?.total ?? nRows.length) > 0 ? '[笔记] OK —— 可解锁特斯拉笔记增量' : '[笔记] 空（组织级笔记无数据/无专业号授权）');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
