// superlogin 第四轮：filters 指定 vSellerId 重放 + UI 改日期抓真实请求
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
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  const adLoginUrl = await page.evaluate(async () => {
    const r = await fetch('/api/partner/user/getUserRtb', { credentials: 'include' });
    return (await r.json())?.data?.adLoginUrl ?? null;
  });
  if (!adLoginUrl) { console.log('adLoginUrl 失败'); await browser.close(); process.exit(1); }

  // 抓报表查询请求
  const reportReqs = [];
  const jg = await ctx.newPage();
  jg.on('request', (req) => {
    const u = req.url();
    if (/report\/data\/(overall|distribution)|rtb\/common\/data\/report/.test(u) && req.method() === 'POST') {
      reportReqs.push({ u: u.slice(0, 140), b: (req.postData() || '').slice(0, 1200) });
    }
  });

  await jg.goto(adLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(8000);
  await jg.goto(`https://ad.xiaohongshu.com/aurora/ad/datareports-createsimple/note?vSellerId=${VSILLER_ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);

  // 重放：filters 带 vSellerId
  const results = {};
  const tryReport = async (name, url, body) => {
    const r = await jg.evaluate(
      async ({ url, body }) => {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        return { status: res.status, text: (await res.text()).slice(0, 2500) };
      },
      { url, body },
    );
    results[name] = r;
    console.log(`[${name}] ${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 240)}`);
  };

  const vsFilter = [{ name: 'vSellerId', operator: 'EQUAL', val: VSILLER_ID }];
  await tryReport('F1_table_vseller', 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
    pageNum: 1, pageSize: 10, sorts: [], filters: vsFilter, dataCaliber: 0,
    startDate: '2026-09-01', endDate: '2026-09-30', timeUnit: 'DAY', splitColumns: [],
    webModule: 'base_report_page', dataSource: 'easy_promotion_note', dataPattern: 'table',
    columns: ['time', 'noteId', 'fee', 'impression', 'click', 'interaction', 'messageConsult'],
  });
  await tryReport('F2_overall_vseller', 'https://ad.xiaohongshu.com/api/light/ad/report/data/overall', {
    startDate: '2026-09-01', endDate: '2026-09-30', webModule: 'base_report_page',
    dataPattern: 'summary', dataSource: 'easy_promotion_note', filters: vsFilter,
    columns: ['fee', 'impression', 'click', 'interaction', 'messageConsult'],
  });
  // vSellerId 变体命名尝试
  for (const nm of ['virtualSellerId', 'vseller_id', 'adAgentSubAccount.virtualSellerId']) {
    await tryReport(`F3_${nm}`, 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
      pageNum: 1, pageSize: 5, sorts: [], filters: [{ name: nm, operator: 'EQUAL', val: VSILLER_ID }], dataCaliber: 0,
      startDate: '2026-09-01', endDate: '2026-09-30', timeUnit: 'DAY', splitColumns: [],
      webModule: 'base_report_page', dataSource: 'easy_promotion_note', dataPattern: 'table',
      columns: ['time', 'noteId', 'fee', 'impression', 'click'],
    }).catch(() => {});
  }

  // UI 改日期：点开始日期输入，填充 09-01
  console.log('[ui] 尝试改日期控件为 09-01~09-30 ...');
  try {
    const inputs = jg.locator('input[placeholder]');
    const dateInputs = jg.locator('input');
    const cnt = await dateInputs.count();
    let filled = 0;
    for (let i = 0; i < cnt && filled < 2; i++) {
      const el = dateInputs.nth(i);
      const ph = await el.getAttribute('placeholder').catch(() => '');
      const val = await el.inputValue().catch(() => '');
      if (/2026-09-2\d/.test(val)) {
        await el.click({ timeout: 3000 }).catch(() => {});
        await el.fill(filled === 0 ? '2026-09-01' : '2026-09-30').catch(() => {});
        await el.press('Enter').catch(() => {});
        filled++;
        await sleep(2500);
      }
    }
    console.log(`[ui] 填了 ${filled} 个日期输入`);
  } catch (e) {
    console.log('[ui] 日期操作失败:', String(e).slice(0, 80));
  }
  await sleep(6000);
  console.log('[ui] 页面触发的报表请求:');
  for (const r of reportReqs.slice(0, 6)) {
    console.log('---', r.u);
    console.log('   ', r.b.slice(0, 500));
  }
  await jg.screenshot({ path: path.join(OUT, 'sl4-after-date.png'), fullPage: false });

  fs.writeFileSync(path.join(OUT, 'sl4-replay.json'), JSON.stringify({ results, reportReqs }, null, 1), 'utf8');
  console.log('[out] sl4-replay.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
