// superlogin 第九轮：行内「跳转」→ 子账户聚光视图 → 查报表找有数据的账户
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGET = process.env.TARGET || '特斯拉KOS项目-基础';

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await page.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = page.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);

  // 定位目标行的行内「跳转」
  const row = page.locator('tr', { hasText: TARGET }).first();
  if (!(await row.count())) { console.log('未找到行:', TARGET); await browser.close(); process.exit(1); }
  console.log('[1] 目标行:', (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90));
  const rowJump = row.locator('text=跳转').first();
  console.log('[1] 行内跳转按钮 count:', await rowJump.count());

  // 点击行内跳转：可能是下拉（先展开）或直接跳
  const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
  await rowJump.click({ timeout: 8000 }).catch((e) => console.log('点击异常:', String(e).slice(0, 80)));
  await sleep(3500);
  let popup = await popupPromise;

  // 若出现下拉选项（专业号平台/聚光平台/乘风平台），点「聚光平台」
  if (!popup) {
    const opts = ['聚光平台'];
    console.log('[2] 行内下拉选项:', JSON.stringify(opts));
    await page.screenshot({ path: path.join(OUT, 'sl9-row-dropdown.png') });
    // hover 触发下拉（portal 渲染在 body），点击可见的「聚光平台」
    await rowJump.hover({ timeout: 5000 }).catch(() => {});
    await sleep(1500);
    const picks = page.locator('text="聚光平台"');
    const n = await picks.count();
    console.log('[2] 聚光平台匹配数:', n);
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const el = picks.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const pp2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
        await el.click({ timeout: 6000 }).catch(() => {});
        popup = await pp2;
        clicked = true;
        break;
      }
    }
    console.log('[2] 点击可见项:', clicked);
  }

  if (!popup) {
    // 同窗跳转兜底
    await sleep(5000);
    console.log('[2] 当前 URL:', page.url().slice(0, 120));
    if (/ad\.xiaohongshu\.com/.test(page.url())) popup = page;
  }
  if (!popup) { console.log('[2] 未进入聚光'); await page.screenshot({ path: path.join(OUT, 'sl9-no-popup.png') }); await browser.close(); process.exit(1); }

  await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await sleep(8000);
  console.log('[3] 聚光 URL:', popup.url().slice(0, 130));
  await popup.screenshot({ path: path.join(OUT, 'sl9-juguang-view.png') });

  // 查 9 月 + 全历史 报表（campaign 层级）
  const r = await popup.evaluate(async () => {
    const q = async (startDate, endDate) => {
      const res = await fetch('https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pageNum: 1, pageSize: 10, sorts: [], filters: [], dataCaliber: 0,
          startDate, endDate, timeUnit: 'DAY', splitColumns: [],
          webModule: 'base_report_page', dataSource: 'campaign', dataPattern: 'table',
          columns: ['time', 'campaignName', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'msgLeadsNum'],
        }),
      });
      return (await res.text()).slice(0, 2500);
    };
    return { sep: await q('2026-09-01', '2026-09-30'), full: await q('2026-01-01', '2026-09-30') };
  }).catch((e) => ({ err: String(e).slice(0, 100) }));
  console.log('[4] 9月报表:', String(r.sep || '').replace(/\s+/g, ' ').slice(0, 500));
  fs.writeFileSync(path.join(OUT, 'sl9-report.json'), JSON.stringify(r, null, 1), 'utf8');
  const hasData = /"totalCount":\s*[1-9]/.test(r.sep || '') || /"fee":"[1-9]/.test(r.sep || '');
  console.log('[4] 有数据?', hasData);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
