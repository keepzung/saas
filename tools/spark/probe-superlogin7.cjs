// superlogin 第七轮：遍历 partner 子账户「跳转」→ 各子账户聚光视图查 9 月报表 → 找出有数据的
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);

  // 抓子账户列表数据（含 virtualSellerId/名称）
  const listApi = [];
  page.on('response', async (res) => {
    if (/subAccount|subaccount|vseller/i.test(res.url()) && res.request().method() === 'GET') {
      try {
        const t = await res.text();
        if (t.includes('virtualSellerId') || t.includes('subAccount')) listApi.push(t.slice(0, 8000));
      } catch {}
    }
  });
  console.log('[1] 打开子账户列表 ...');
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await page.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了', '关闭']) {
    const b = page.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);
  const listText = await page.evaluate(() => (document.body.innerText || '').slice(0, 1500));
  console.log('[1] 列表页文本样例:', JSON.stringify(listText.slice(0, 400)));

  // 遍历「跳转」按钮（最多 14 个）
  const jumpBtns = page.locator('text=跳转');
  const total = Math.min(await jumpBtns.count(), 14);
  console.log('[2] 跳转按钮数:', total);
  const summary = [];

  for (let i = 0; i < total; i++) {
    // 每次回到列表页重新定位（popup 打开后列表页仍在）
    const btn = page.locator('text=跳转').nth(i);
    // 行文本（账号名）
    let rowName = '';
    try {
      const row = btn.locator('xpath=ancestor::tr | ancestor::[contains(@class,"row")]').first();
      rowName = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60);
    } catch {}
    const popupPromise = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    await btn.click({ timeout: 8000 }).catch(() => {});
    const popup = await popupPromise;
    if (!popup) { console.log(`[${i}] 无 popup`); continue; }
    await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
    await sleep(6000);
    const url = popup.url();
    if (!/ad\.xiaohongshu\.com/.test(url)) {
      console.log(`[${i}] popup 非聚光:`, url.slice(0, 90));
      await popup.close().catch(() => {});
      continue;
    }
    // 查 9 月 campaign 报表
    const r = await popup.evaluate(async () => {
      const res = await fetch('https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pageNum: 1, pageSize: 5, sorts: [], filters: [], dataCaliber: 0,
          startDate: '2026-09-01', endDate: '2026-09-30', timeUnit: 'DAY', splitColumns: [],
          webModule: 'base_report_page', dataSource: 'campaign', dataPattern: 'table',
          columns: ['time', 'campaignName', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'msgLeadsNum'],
        }),
      });
      return { status: res.status, text: (await res.text()).slice(0, 1800) };
    }).catch((e) => ({ status: 0, text: String(e).slice(0, 100) }));
    let hasData = false;
    let brief = '';
    try {
      const j = JSON.parse(r.text);
      const totalFee = j?.data?.totalData?.dataValueJson ? JSON.parse(j.data.totalData.dataValueJson).fee : null;
      const cnt = j?.data?.page?.totalCount ?? 0;
      brief = `totalCount=${cnt} totalFee=${totalFee}`;
      hasData = Number(cnt) > 0;
    } catch { brief = r.text.slice(0, 120); }
    summary.push({ i, rowName, url: url.slice(0, 100), brief, hasData });
    console.log(`[${i}] ${rowName} → ${brief} ${hasData ? '←←← 有数据!' : ''}`);
    if (hasData) {
      await popup.screenshot({ path: path.join(OUT, `sl7-hit-${i}.png`) });
      fs.writeFileSync(path.join(OUT, `sl7-hit-${i}.json`), r.text, 'utf8');
    }
    await popup.close().catch(() => {});
    await sleep(2500);
  }

  console.log('\n===== 汇总 =====');
  for (const s of summary) console.log(s.hasData ? '★' : '-', s.i, s.rowName, '|', s.brief);
  fs.writeFileSync(path.join(OUT, 'sl7-summary.json'), JSON.stringify({ summary, listApi }, null, 1), 'utf8');
  console.log('[out] sl7-summary.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
