// superlogin 第十三轮：子账户聚光视图 → 标准投「笔记报表」（探测 dataSource 与数据结构）
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

  const row = page.locator('tr', { hasText: TARGET }).first();
  const rowJump = row.locator('text=跳转').first();
  const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
  await rowJump.click({ timeout: 8000 }).catch(() => {});
  await sleep(3500);
  let popup = await popupPromise;
  if (!popup) {
    await rowJump.hover({ timeout: 5000 }).catch(() => {});
    await sleep(1500);
    const picks = page.locator('text="聚光平台"');
    for (let i = 0; i < (await picks.count()); i++) {
      if (await picks.nth(i).isVisible().catch(() => false)) {
        const pp2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
        await picks.nth(i).click({ timeout: 6000 }).catch(() => {});
        popup = await pp2;
        break;
      }
    }
  }
  if (!popup) { console.log('未进入聚光'); await browser.close(); process.exit(1); }
  await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await sleep(8000);
  const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? '';
  console.log('[1] 聚光视图 vSellerId=' + vseller);

  const captured = [];
  popup.on('response', async (res) => {
    const u = res.url();
    if (/report\/data\/(overall|distribution)|rtb\/common\/data\/report/.test(u) && res.request().method() === 'POST') {
      let body = '';
      try { body = (await res.text()).slice(0, 8000); } catch {}
      captured.push({ u: u.slice(0, 140), req: (res.request().postData() || '').slice(0, 1600), res: body });
    }
  });

  // 打开标准投「笔记报表」（URL 模式猜测：datareports-basic/note；失败则点击侧边栏）
  console.log('[2] 打开标准投笔记报表 ...');
  await popup.goto(`https://ad.xiaohongshu.com/aurora/ad/datareports-basic/note?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  let info = await popup.evaluate(() => ({
    url: location.href.slice(0, 140),
    snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
  }));
  console.log('[2] note 路径页面:', JSON.stringify(info));
  if (!/笔记报表/.test(info.snippet)) {
    console.log('[2] 路径不对，点击侧边栏「笔记报表」...');
    const menu = popup.locator('text=笔记报表').last();
    await menu.click({ timeout: 8000 }).catch(() => {});
    await sleep(12000);
    info = await popup.evaluate(() => ({ url: location.href.slice(0, 140), snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220) }));
    console.log('[2] 侧边栏导航后:', JSON.stringify(info));
  }
  await popup.screenshot({ path: path.join(OUT, 'sl13-note-report.png'), fullPage: false });

  // UI 改日期 09-01~09-30 触发查询
  const inputs = popup.locator('input');
  const cnt = await inputs.count();
  let filled = 0;
  for (let i = 0; i < cnt && filled < 2; i++) {
    const el = inputs.nth(i);
    const val = await el.inputValue().catch(() => '');
    if (/^2026-09-\d{2}$/.test(val) || /^2026-10-\d{2}$/.test(val)) {
      await el.click({ timeout: 3000 }).catch(() => {});
      await sleep(500);
      await el.fill(filled === 0 ? '2026-09-01' : '2026-09-30').catch(() => {});
      await el.press('Enter').catch(() => {});
      filled++;
      await sleep(2500);
    }
  }
  console.log(`[3] 填充 ${filled} 个日期`);
  await sleep(10000);
  await popup.screenshot({ path: path.join(OUT, 'sl13-note-report-sep.png'), fullPage: false });

  console.log(`\n===== 笔记报表捕获 ${captured.length} 条 =====`);
  for (const c of captured.slice(0, 8)) {
    console.log('---', c.u);
    console.log('  REQ:', c.req.slice(0, 500));
    console.log('  RES:', c.res.replace(/\s+/g, ' ').slice(0, 400));
  }
  fs.writeFileSync(path.join(OUT, 'sl13-note-capture.json'), JSON.stringify(captured, null, 1), 'utf8');
  console.log('[out] sl13-note-capture.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
