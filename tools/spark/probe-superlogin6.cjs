// superlogin 第六轮：filters vSellerId 试探 + 全历史查询 + 主账号品牌列表
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

  const jg = await ctx.newPage();
  await jg.goto(adLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(8000);

  const results = {};
  const tryReport = async (name, url, body) => {
    const r = await jg.evaluate(
      async ({ url, body }) => {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        return { status: res.status, text: (await res.text()).slice(0, 2200) };
      },
      { url, body },
    );
    results[name] = r;
    console.log(`[${name}] ${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 260)}`);
  };

  // 1) 全历史（campaign 层级）
  await tryReport('G1_campaign_full_history', 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
    pageNum: 1, pageSize: 20, sorts: [], filters: [], dataCaliber: 0,
    startDate: '2025-01-01', endDate: '2026-10-01', timeUnit: 'DAY', splitColumns: [],
    webModule: 'base_report_page', dataSource: 'campaign', dataPattern: 'table',
    columns: ['time', 'campaignName', 'campaignId', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'msgLeadsNum'],
  });

  // 2) account_standard 全历史
  await tryReport('G2_account_standard_full', 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
    pageNum: 1, pageSize: 20, sorts: [], filters: [], dataCaliber: 0,
    startDate: '2025-01-01', endDate: '2026-10-01', timeUnit: 'DAY', splitColumns: [],
    webModule: 'base_report_page', dataSource: 'account_standard', dataPattern: 'table',
    columns: ['time', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'msgLeadsNum'],
  });

  // 3) filters vSellerId 试探
  for (const nm of ['vSellerId', 'virtualSellerId']) {
    await tryReport(`G3_${nm}`, 'https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
      pageNum: 1, pageSize: 10, sorts: [], filters: [{ name: nm, operator: 'EQUAL', val: VSILLER_ID }], dataCaliber: 0,
      startDate: '2025-01-01', endDate: '2026-10-01', timeUnit: 'DAY', splitColumns: [],
      webModule: 'base_report_page', dataSource: 'campaign', dataPattern: 'table',
      columns: ['time', 'campaignName', 'fee', 'impression', 'click', 'messageConsult', 'msgLeadsNum'],
    }).catch(() => {});
  }

  // 4) 右上角账号下拉 → 品牌列表
  console.log('[brand] 展开右上角账号下拉 ...');
  const acctBtn = jg.locator('text=乐享其乘').first();
  if (await acctBtn.count()) {
    await acctBtn.click({ timeout: 5000 }).catch(() => {});
    await sleep(2500);
    await jg.screenshot({ path: path.join(OUT, 'sl6-account-dropdown.png'), fullPage: false });
    const opts = await jg.evaluate(() => {
      const texts = [];
      for (const el of document.querySelectorAll('li, [class*="option"], [class*="item"], [class*="menu"]')) {
        const t = (el.innerText || '').trim();
        if (t && t.length < 40 && t.includes('\n') === false) texts.push(t);
      }
      return [...new Set(texts)].slice(0, 30);
    });
    console.log('[brand] 下拉选项:', JSON.stringify(opts));
  } else {
    console.log('[brand] 未找到账号按钮');
  }

  fs.writeFileSync(path.join(OUT, 'sl6-replay.json'), JSON.stringify(results, null, 1), 'utf8');
  console.log('[out] sl6-replay.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
