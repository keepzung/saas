// superlogin 第八轮：监听「跳转」点击时的 API（找 SSO URL 生成接口），顺带探 partner 数据中心报表
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

  // 记录全部 API（请求+响应）
  const apis = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/partner\.xiaohongshu\.com\/api/.test(u) && !/commoncheck|lightning|decrypt/.test(u)) {
      apis.push({ u: u.slice(0, 250), m: req.method(), b: (req.postData() || '').slice(0, 800), r: null, t: Date.now() });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    const hit = [...apis].reverse().find((a) => a.u === u.slice(0, 250) && a.r === null);
    let body = '';
    try { body = (await res.text()).slice(0, 3000); } catch {}
    if (hit) hit.r = body;
    else if (/partner\.xiaohongshu\.com\/api/.test(u)) apis.push({ u: u.slice(0, 250), m: res.request().method(), b: (res.request().postData() || '').slice(0, 800), r: body, t: Date.now() });
  });

  console.log('[1] 子账户列表 ...');
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await page.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = page.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  const before = apis.length;

  // 点击第一个「跳转」，捕获点击窗口内的 API + popup
  console.log('[2] 点击第 1 个跳转（监听 API）...');
  const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
  const btn = page.locator('text=跳转').first();
  console.log('[2] 按钮可见:', await btn.isVisible().catch(() => false), 'count:', await page.locator('text=跳转').count());
  await btn.click({ timeout: 8000, force: true }).catch((e) => console.log('[2] 点击异常:', String(e).slice(0, 80)));
  await sleep(12000);
  const popup = await popupPromise;
  console.log('[2] popup:', popup ? popup.url().slice(0, 130) : '(无)');
  const clickWindowApis = apis.slice(before);
  console.log(`[2] 点击后新增 API ${clickWindowApis.length} 条:`);
  for (const a of clickWindowApis) {
    console.log('---', a.m, a.u);
    if (a.b) console.log('    REQ:', String(a.b).slice(0, 250));
    if (a.r && /superlogin|ad\.xiaohongshu|ticket|url/i.test(a.r)) console.log('    RES:', String(a.r).slice(0, 600));
  }
  fs.writeFileSync(path.join(OUT, 'sl8-jump-apis.json'), JSON.stringify(clickWindowApis, null, 1), 'utf8');
  if (popup) {
    await popup.screenshot({ path: path.join(OUT, 'sl8-popup.png') }).catch(() => {});
    await popup.close().catch(() => {});
  }
  await page.screenshot({ path: path.join(OUT, 'sl8-list.png') });
  console.log('[out] sl8-jump-apis.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
