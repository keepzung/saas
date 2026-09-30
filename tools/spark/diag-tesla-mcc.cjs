// 特斯拉新 MCC 账号权限三步诊断：组织枚举 → 投放(rtb_metrics) → 笔记(vision noteList)
// 用法:
//   TAG=tesla2 node diag-tesla-mcc.cjs                     # 自动枚举 org，取第一个
//   TAG=tesla2 ORG=xxxx node diag-tesla-mcc.cjs            # 指定 orgCode
// 前置：TAG=tesla2 有头登录过（state/auth-tesla2.json 有效）
// 输出：账号识别 / 组织列表 / 投放账户数与近7日消耗 / 笔记 total 与样例标题
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const ORG_ARG = (process.env.ORG || '').trim();
const STATE_FILE = path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json');
if (!fs.existsSync(STATE_FILE)) {
  console.error(`缺少登录态 ${STATE_FILE}，请先 TAG=${TAG} HEADLESS=0 node login.cjs`);
  process.exit(1);
}

const results = { user: null, orgs: [], org: null, rtb: null, notes: null };

(async () => {
  const browser = await chromium.launch(process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {});
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();

  // 监听全部 API 响应，抓组织结构 + 账号识别
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('/api/')) return;
      if (url.includes('current/user')) {
        const j = await res.json().catch(() => null);
        if (j?.data) {
          results.user = {
            nickname: j.data.nickname ?? j.data.name,
            accountNo: j.data.accountNo ?? j.data.account_no,
            roles: j.data.roles,
          };
        }
      }
    } catch { /* ignore */ }
  });

  await page.goto('https://mcc.xiaohongshu.com/micro/data-monitor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  // Step 1: org 枚举（页面接口 + 常见端点）
  const api = async (p, body) =>
    page.evaluate(
      async ({ p, body }) => {
        const res = await fetch(`https://mcc.xiaohongshu.com${p}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body ?? {}),
        });
        return res.json().catch(() => null);
      },
      { p, body },
    );

  let orgs = [];
  const collect = (j) => {
    const walk = (v) => {
      if (!v) return;
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v === 'object') {
        if (v.accountOrgCode || v.orgCode || v.account_org_code) {
          orgs.push({
            orgCode: String(v.accountOrgCode ?? v.orgCode ?? v.account_org_code),
            name: v.accountOrgName ?? v.orgName ?? v.name ?? '',
          });
        }
        Object.values(v).forEach(walk);
      }
    };
    walk(j);
  };
  for (const [p, body] of [
    ['/api/mcc/org/get_user_account_list', {}],
    ['/api/mcc/current/orgs', {}],
    ['/api/mcc/org/auth_accounts', {}],
  ]) {
    const j = await api(p, body).catch(() => null);
    if (j) collect(j);
  }
  orgs = orgs.filter((o, i, a) => a.findIndex((x) => x.orgCode === o.orgCode) === i);
  results.orgs = orgs;
  const org = ORG_ARG || orgs[0]?.orgCode;
  results.org = org;
  console.log(`[1] 账号: ${JSON.stringify(results.user)}`);
  console.log(`[1] 组织 ${orgs.length} 个: ${JSON.stringify(orgs.map((o) => `${o.name}(${o.orgCode})`))}`);
  if (!org) {
    console.log('[1] !! 未能取到 orgCode —— 请在 MCC 后台 F12 抓任意请求的 accountOrgCode 后 ORG=xxx 重跑');
    fs.writeFileSync(path.join(__dirname, `diag-${TAG}-result.json`), JSON.stringify(results, null, 2));
    await browser.close();
    return;
  }

  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const end = fmt(today);
  const start = fmt(new Date(today.getTime() - 6 * 86400000));

  // Step 2: 投放 rtb_metrics
  const rtb = await api('/api/mcc/board/rtb_metrics', {
    timeStart: `${start} 00:00:00`,
    timeEnd: `${end} 23:59:59`,
    accountOrgCode: org,
    pageIndex: 1,
    pageSize: 5,
  }).catch((e) => ({ err: String(e) }));
  const rtbList =
    rtb?.data?.rtbAccountMetricsVos ?? rtb?.data?.list ?? rtb?.data?.vos ?? [];
  const feeSum = (rtbList ?? []).reduce(
    (s, r) => s + Number(r.fee ?? r.totalFee ?? 0),
    0,
  );
  results.rtb = {
    code: rtb?.code,
    total: rtb?.data?.total ?? rtbList.length,
    sample: rtbList.slice(0, 3).map((r) => ({
      name: r.sellerName ?? r.virtualSellerName ?? r.name,
      fee: r.fee ?? r.totalFee,
    })),
    feeSum,
  };
  console.log(`[2] 投放 rtb: code=${rtb?.code} 账户数=${results.rtb.total} 近7日消耗≈${feeSum.toFixed(2)}`);
  console.log(`    样例: ${JSON.stringify(results.rtb.sample)}`);

  // Step 3: 笔记 vision noteList
  const notes = await api('/api/vision/mcc_dashboard/target_detail_list', {
    viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
    chart: 'noteList',
    accountOrgCode: org,
    dynamicTargets: [],
    frontFilterList: [
      { type: 10, filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, values: [`${start} 00:00:00`, `${end} 23:59:59`] } },
    ],
    pageIndex: 1,
    pageSize: 5,
  }).catch((e) => ({ err: String(e) }));
  const rows =
    notes?.data?.detailDataList ?? notes?.data?.detailVoList ?? notes?.data?.targetList ?? [];
  results.notes = {
    code: notes?.code,
    total: notes?.data?.total ?? rows.length,
    sample: rows.slice(0, 3).map((r) => ({
      title: (r.note_title ?? r.title ?? '').slice(0, 30),
      author: r.author_name ?? r.authorName,
    })),
  };
  console.log(`[3] 笔记 noteList: code=${notes?.code} total=${results.notes.total}`);
  console.log(`    样例: ${JSON.stringify(results.notes.sample)}`);

  console.log('\n==== 结论 ====');
  console.log(
    results.rtb.total > 0
      ? '[投放] OK —— MCC 通道可接管特斯拉投放数据'
      : '[投放] 空 —— 组织下无聚光账户或无权限',
  );
  console.log(
    results.notes.total > 0
      ? '[笔记] OK —— 可解锁特斯拉笔记增量（syncNotes 切 brand 6）'
      : '[笔记] 空 —— 组织级笔记无数据/无权限（同荣威 9-20 绑定前状态，需确认专业号数据授权）',
  );

  fs.writeFileSync(path.join(__dirname, `diag-${TAG}-result.json`), JSON.stringify(results, null, 2));
  console.log(`\n结果已存 diag-${TAG}-result.json`);
  await browser.close();
})().catch((e) => {
  console.error('DIAG FAIL', e);
  process.exit(1);
});
