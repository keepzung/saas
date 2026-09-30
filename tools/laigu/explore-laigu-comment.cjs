// 来鼓：评论模块 + 设置/开放API 探测（复用登录态）
// 用法: TAG=laigu-tesla NO_PROXY=1 node explore-laigu-comment.cjs
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'laigu-tesla').trim();
const OUT = path.join(__dirname, 'state', `laigu-comment-${TAG}.json`);
const STATE = path.join(__dirname, 'state', `laigu-state-${TAG}.json`);
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const reqs = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/\.(js|css|png|jpg|svg|woff|woff2|ico|map|ttf|wav)(\?|$)/.test(url)) return;
    if (/spider|apm|sentry/.test(url)) return;
    reqs.push({ url: url.slice(0, 180), method: req.method(), postData: (req.postData() ?? '').slice(0, 800) });
  });
  const resps = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!/laigu\.com/.test(url)) return;
      if (/\.(js|css|png|jpg|svg|woff|woff2|ico|map)(\?|$)/.test(url)) return;
      const body = (await res.text().catch(() => '')).slice(0, 1800);
      resps.push({ url: url.slice(0, 180), status: res.status(), body });
    } catch { /* ignore */ }
  });

  const gotoRetry = async (url, wait = 6000) => {
    for (let i = 1; i <= 3; i++) {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); break; }
      catch (e) { console.log(`[goto retry ${i}] ${e.message.split('\n')[0]}`); await page.waitForTimeout(3000); }
    }
    await page.waitForTimeout(wait);
  };

  const clickText = async (t, wait = 5000) => {
    try {
      const el = page.locator(`text=${t}`).first();
      if (await el.count()) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(wait);
        return true;
      }
    } catch (e) { console.log(`  [click fail] ${t}: ${e.message.split('\n')[0]}`); }
    return false;
  };

  // 1) 评论模块
  console.log('[1] 打开评论模块 ...');
  await gotoRetry('https://pro.laigu.com/dashboard', 5000);
  await clickText('评论', 4000);
  const url1 = page.url();
  console.log('  url:', url1);
  // 子导航：评论管理
  await clickText('评论管理', 5000);
  console.log('  评论管理 url:', page.url());
  const text1 = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500)).catch(() => '');
  console.log('  文本:', text1.slice(0, 500));
  await page.screenshot({ path: path.join(__dirname, 'state', `laigu-comment-${TAG}.png`), fullPage: false });
  // 评论内容子项
  await clickText('评论内容', 5000);
  console.log('  评论内容 url:', page.url());
  const text2 = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500)).catch(() => '');
  console.log('  文本:', text2.slice(0, 600));
  await page.screenshot({ path: path.join(__dirname, 'state', `laigu-comment-content-${TAG}.png`), fullPage: false });

  // 2) 设置 → 开放API（找 app_key/secret）
  console.log('[2] 设置/开放API ...');
  await gotoRetry('https://pro.laigu.com/dashboard', 3000);
  await clickText('设置', 4000);
  const setMenu = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && /开放|API|密钥|应用/.test((el.innerText || '').trim()) && (el.innerText || '').trim().length < 14)
      .map((el) => (el.innerText || '').trim())
      .slice(0, 15),
  ).catch(() => []);
  console.log('  设置子菜单候选:', JSON.stringify(setMenu));
  for (const s of setMenu.slice(0, 6)) {
    await clickText(s, 3000);
    const t = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 900)).catch(() => '');
    if (/app_?[kK]ey|secret|密钥|token/i.test(t)) {
      console.log(`  [${s}] 命中凭据相关文本:\n${t.slice(0, 600)}`);
      await page.screenshot({ path: path.join(__dirname, 'state', `laigu-openapi-${TAG}.png`), fullPage: false });
      break;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ reqs, resps }, null, 1));
  console.log(`\n[done] 请求 ${reqs.length} 响应 ${resps.length} → ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
