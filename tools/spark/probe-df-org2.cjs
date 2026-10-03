#!/usr/bin/env node
// 东风奕境 MCC 组织三通道探测：账号识别 / 聚光投放 rtb_metrics / 笔记 noteList / 专业号 proMetrics
// 前置: TAG=df 登录生成 state/auth-df.json
// 用法: node probe-df-org2.cjs
const path = require('path');
const fs = require('fs');

const ORG = process.env.DF_ORG || '2065237270777610240';
const stateFile = path.join(__dirname, 'state', 'auth-df.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const COOKIE = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const H = {
  'Content-Type': 'application/json',
  Cookie: COOKIE,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Referer: 'https://mcc.xiaohongshu.com/micro/home',
  Origin: 'https://mcc.xiaohongshu.com',
};

const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200), status: res.status }; }
};

const fmt = (v) => (v == null ? '-' : String(v));
(async () => {
  // 0) 账号识别
  const me = await post('https://mcc.xiaohongshu.com/api/mcc/current/user/v2', {});
  console.log('[账号]', JSON.stringify({
    code: me.code,
    nickname: me.data?.nickname ?? me.data?.userName,
    accountNo: me.data?.accountNo,
    org: me.data?.currentOrg?.orgName ?? me.data?.orgName,
    orgCode: me.data?.currentOrg?.orgCode ?? me.data?.accountOrgCode,
  }));

  const now = new Date();
  const daysAgo = (n) => {
    const d = new Date(now.getTime() - n * 86400000);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const timeStart = `${daysAgo(30)}000000`;
  const timeEnd = `${daysAgo(1)}235959`;

  // 1) 聚光投放账户（rtb_metrics）
  const rtb = await post('https://mcc.xiaohongshu.com/api/mcc/board/rtb_metrics', {
    timeStart, timeEnd, accountOrgCode: ORG, pageIndex: 1, pageSize: 100,
  });
  const rtbList = rtb.data?.list ?? rtb.data?.rtbAccountMetricsVos ?? [];
  const feeSum = rtbList.reduce((s, a) => s + Number(a.fee ?? a.cost ?? 0), 0);
  console.log('[聚光投放]', JSON.stringify({
    code: rtb.code,
    accounts: rtbList.length,
    total: rtb.data?.total ?? null,
    feeSumNear30d: (feeSum / 1e6).toFixed(2) + ' 元',
    sampleFields: rtbList[0] ? Object.keys(rtbList[0]).slice(0, 20) : [],
    sampleName: rtbList[0]?.name ?? rtbList[0]?.accountName ?? null,
  }));

  // 2) 组织级笔记明细（vision noteList）
  const nl = await post('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
    viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
    chart: 'noteList',
    dynamicTargets: [],
    frontFilterList: [
      { filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, values: [timeStart, timeEnd], quickFilter: false, tableFilterType: 'dateRange', singleSelection: false, startTime: timeStart, endTime: timeEnd } },
    ],
    limit: 10, orderBy: '', order: '', pageIndex: 1, pageSize: 10, skip: 0, take: 10,
  });
  const rows = nl.data?.detailDataList ?? nl.data?.detailVoList ?? nl.data?.targetList ?? [];
  console.log('[笔记明细]', JSON.stringify({
    code: nl.code,
    msg: nl.msg,
    total: nl.data?.total ?? nl.data?.totalCount ?? rows.length,
    rows: rows.length,
    sampleTitle: rows[0]?.noteTitle ?? rows[0]?.targetCode ?? null,
    sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 25) : [],
  }));

  // 3) 专业号汇总（proMetricsList）
  const pm = await post('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
    viewAlias: 'mcc_assets_proAccountView',
    chart: 'proMetricsList',
    dynamicTargets: [],
    frontFilterList: [
      { filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, values: [timeStart, timeEnd], quickFilter: false, tableFilterType: 'dateRange', singleSelection: false, startTime: timeStart, endTime: timeEnd } },
    ],
    limit: 10, orderBy: '', order: '', pageIndex: 1, pageSize: 10, skip: 0, take: 10,
  });
  const pmRows = pm.data?.detailDataList ?? pm.data?.detailVoList ?? pm.data?.targetList ?? [];
  console.log('[专业号]', JSON.stringify({ code: pm.code, msg: pm.msg, rows: pmRows.length, sampleKeys: pmRows[0] ? Object.keys(pmRows[0]).slice(0, 20) : [] }));
})().catch((e) => {
  console.error('probe error:', e.message);
  process.exit(1);
});
