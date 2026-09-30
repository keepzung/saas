// 专业号企业平台（pro.xiaohongshu.com）探测：登录态复用检查 + 全 API 捕获
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const STATE_FILE = path.join(__dirname, `state/auth-${TAG}.json`);
const OUT = path.join(__dirname, `state/pro-capture-${TAG}.json`);

const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const apis = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('/api/') && !url.includes('/gateway') && !url.includes('/eden')) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 600);
      apis.push({ url: url.replace('https://pro.xiaohongshu.com', '').slice(0, 150), method: res.request().method(), status: res.status(), body });
    } catch { /* ignore */ }
  });

  let finalUrl = '';
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`[*] goto attempt ${i} ...`);
      await page.goto('https://pro.xiaohongshu.com/enterprise/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
      finalUrl = page.url();
      break;
    } catch (e) {
      console.log(`[*] goto fail: ${e.message.split('\n')[0]}`);
      await page.waitForTimeout(4000);
    }
  }
  await page.waitForTimeout(12000);
  finalUrl = page.url();
  console.log(`[*] final url: ${finalUrl}`);
  const needLogin = /login|passport|sso/i.test(finalUrl);
  console.log(`[*] 需要登录: ${needLogin}`);
  await page.screenshot({ path: path.join(__dirname, 'state', `pro-home-${TAG}.png`), fullPage: false });

  if (needLogin) {
    // 用同账密在专业号平台登录（有头窗口可人工兜底）
    console.log('[*] 尝试同账密登录 ...');
    const userInput = page.locator('input[type=text], input[placeholder*=邮箱], input[placeholder*=账号], input[placeholder*=手机]').locator('visible=true').first();
    const passInput = page.locator('input[type=password]').locator('visible=true').first();
    if ((await userInput.count()) && (await passInput.count())) {
      await userInput.fill('1436271204@qq.com');
      await passInput.fill('Tesla123!');
      const agree = page.locator('text=我已阅读').first();
      if (await agree.count()) {
        try {
          const box = await agree.boundingBox({ timeout: 3000 });
          if (box) await page.mouse.click(box.x - 20, box.y + box.height / 2);
        } catch { /* ignore */ }
      }
      await page.locator('button:has-text("登录"), button:has-text("登 录")').first().click().catch(() => {});
      await page.waitForTimeout(10000);
      console.log('[*] after login url:', page.url());
      await page.screenshot({ path: path.join(__dirname, 'state', `pro-after-login-${TAG}.png`) });
      await ctx.storageState({ path: STATE_FILE }).catch(() => {});
    } else {
      console.log('[*] 未找到登录输入框（可能扫码页），请在弹出窗口人工登录，等待 180s ...');
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (!/login|passport|sso/i.test(page.url())) break;
        await page.waitForTimeout(3000);
      }
      await ctx.storageState({ path: STATE_FILE }).catch(() => {});
    }
    // 登录后重新进企业主页
    try {
      await page.goto('https://pro.xiaohongshu.com/enterprise/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch { /* ignore */ }
    await page.waitForTimeout(12000);
    console.log('[*] final url:', page.url());
    await page.screenshot({ path: path.join(__dirname, 'state', `pro-home2-${TAG}.png`), fullPage: false });
  }

  // 页面可见文本快照（识别有哪些数据板块）
  const texts = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500)).catch(() => '');
  console.log('\n[*] 页面文本快照:\n', texts);

  const uniq = apis.filter((a, i, arr) => arr.findIndex((x) => x.url === a.url && x.method === a.method) === i);
  fs.writeFileSync(OUT, JSON.stringify({ finalUrl: page.url(), apis: uniq }, null, 1));
  console.log(`\n[*] 捕获 API ${uniq.length} 个 → ${path.relative(process.cwd(), OUT)}`);
  for (const a of uniq.slice(0, 40)) console.log(`  ${a.method} ${a.url} [${a.status}]`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
