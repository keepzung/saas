#!/usr/bin/env node
// 员工矩阵分析：拉 target_config_list 全量找 chart 名 → target_detail_list 拉员工行（含头像字段?）
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));

const ORG = '2065237270777610240';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: path.join(__dirname, 'state', 'auth-df.json'), timeZoneId: 'Asia/Shanghai' });
  const page = await ctx.newPage();
  await page.goto('https://mcc.xiaohongshu.com/micro/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const out = await page.evaluate(async (org) => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    const cfg = await post('/api/vision/mcc_dashboard/target_config_list', {
      viewAlias: 'mcc_assets_staffMatrix_analysisView', chart: 'statisticCard', bizCode: 'mcc_assets_staffMatrix',
    });
    const charts = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (k.toLowerCase().includes('chart') && typeof v === 'string') charts.add(v);
        walk(v);
      }
    };
    walk(cfg);
    // 常见 chart 名直接试
    const candidates = [...charts, 'staffList', 'tableList', 'staffTable', 'brandList', 'list', 'staff_matrix_list', 'kosStaffList'];
    const results = [];
    const end = new Date(); const start = new Date(Date.now() - 29 * 86400000);
    const d = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');
    for (const chart of candidates) {
      try {
        const r = await post('/api/vision/mcc_dashboard/target_detail_list', {
          viewAlias: 'mcc_assets_staffMatrix_analysisView', chart,
          dynamicTargets: [],
          frontFilterList: [
            { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ labelValue: 'date_key', labelName: '日维度', selected: 1 }] } },
            { filterField: 'date_key', filterFieldName: '统计时间', filterType: 10, timeFilter: { values: [d(start), d(end)], pattern: 10, timeShowType: 11 } },
          ],
          orgFilter: { accountOrgCode: org },
          limit: 5, pageIndex: 1, pageSize: 5, skip: 0, take: 5,
        });
        const rows = r?.data?.detailDataList ?? r?.data?.detailVoList ?? r?.data?.targetList ?? [];
        results.push({ chart, code: r.code ?? r.success, total: r?.data?.total ?? rows.length, keys: rows[0] ? Object.keys(rows[0]).slice(0, 40) : [], sample: rows[0] ? JSON.stringify(rows[0]).slice(0, 500) : null });
      } catch (e) { results.push({ chart, err: e.message }); }
    }
    return results;
  }, ORG);
  for (const r of out) {
    console.log('===', r.chart, 'code=', r.code, 'total=', r.total);
    if (r.keys?.length) console.log('  keys:', r.keys.join(','));
    if (r.sample) console.log('  sample:', r.sample);
    if (r.err) console.log('  err:', r.err);
  }
  fs.writeFileSync(path.join(__dirname, 'state', 'df-staff-list-probe.json'), JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
