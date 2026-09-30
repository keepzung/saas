// superlogin 第三轮：链路重建后，页面上下文重放报表 API（改日期 9 月整月 + 探测 dataSource）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const VSILLER_ID = process.env.VSELLER_ID || '65ddbf44275f9b000187a7bb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  console.log('[1] partner 会话 ...');
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  const adLoginUrl = await page.evaluate(async () => {
    const r = await fetch('/api/partner/user/getUserRtb', { credentials: 'include' });
    return (await r.json())?.data?.adLoginUrl ?? null;
  });
  if (!adLoginUrl) { console.log('adLoginUrl 拿不到'); await browser.close(); process.exit(1); }
  console.log('[1] superlogin OK');

  const jg = await ctx.newPage();
  await jg.goto(adLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(8000);
  await jg.goto(`https://ad.xiaohongshu.com/aurora/ad/datareports-createsimple/note?vSellerId=${VSILLER_ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(10000);

  const results = {};
  const tryReport = async (name, url, body) => {
    const r = await jg.evaluate(
      async ({ url, body }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        return { status: res.status, text: (await res.text()).slice(0, 3000) };
      },
      { url, body },
    );
    results[name] = r;
    const brief = r.text.replace(/\s+/g, ' ').slice(0, 260);
    console.log(`[${name}] ${r.status} ${brief}`);
  };

  // 实验 A：简单投笔记报表（改 9 月整月）
  await tryReport('A_easy_note_9m', 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
    pageNum: 1, pageSize: 20, sorts: [], filters: [], dataCaliber: 0,
    startDate: '2026-09-01', endDate: '2026-09-30', timeUnit: 'DAY', splitColumns: [],
    webModule: 'base_report_page', dataSource: 'easy_promotion_note', dataPattern: 'table',
    columns: ['time', 'noteId', 'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'interaction', 'messageConsult'],
  });

  // 实验 B：基础报表总览（9 月）
  await tryReport('B_overall_9m', 'https://ad.xiaohongshu.com/api/light/ad/report/data/overall', {
    startDate: '2026-09-01', endDate: '2026-09-30', webModule: 'base_report_page',
    dataPattern: 'summary', dataSource: 'easy_promotion_note', filters: [],
    columns: ['fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'interaction', 'cpi', 'messageConsult', 'msgLeadsCost'],
  });

  // 实验 C：dataSource 探测（report 总表，多种 dataSource）
  for (const ds of ['all', 'note', 'search', 'display', 'easy_promotion']) {
    await tryReport(`C_ds_${ds}`, 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
      pageNum: 1, pageSize: 5, sorts: [], filters: [], dataCaliber: 0,
      startDate: '2026-09-01', endDate: '2026-09-30', timeUnit: 'DAY', splitColumns: [],
      webModule: 'base_report_page', dataSource: ds, dataPattern: 'table',
      columns: ['time', 'noteId', 'fee', 'impression', 'click', 'interaction', 'messageConsult'],
    }).catch(() => {});
  }

  fs.writeFileSync(path.join(OUT, 'sl3-replay.json'), JSON.stringify(results, null, 1), 'utf8');
  console.log('[out] state/partner-full/sl3-replay.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
