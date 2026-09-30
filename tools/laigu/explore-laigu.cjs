// 来鼓后台（pro.laigu.com）探测：登录 + 菜单结构 + API 捕获
// 用法: TAG=laigu-tasla NO_PROXY=1 node explore-laigu.cjs
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'laigu-tesla').trim();
const OUT = path.join(__dirname, 'state', `laigu-capture-${TAG}.json`);
const ENV = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', 'spark', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const USER = process.env.LG_USER || ENV.LG_USER || '13348900747';
const PASS = process.env.LG_PASS || ENV.LG_PASS || '1510Ywys';
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const apis = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!/laigu\.com/.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 800);
      const pd = (res.request().postData() ?? '').slice(0, 500);
      apis.push({ url: url.slice(0, 170), method: res.request().method(), status: res.status(), postData: pd, body });
    } catch { /* ignore */ }
  });

  const gotoRetry = async (url, wait = 6000) => {
    for (let i = 1; i <= 3; i++) {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); break; }
      catch (e) { console.log(`[goto retry ${i}] ${e.message.split('\n')[0]}`); await page.waitForTimeout(3000); }
    }
    await page.waitForTimeout(wait);
  };

  console.log('[*] 打开 pro.laigu.com/dashboard ...');
  await gotoRetry('https://pro.laigu.com/dashboard', 6000);
  console.log('[*] url:', page.url());

  // 设备冲突：继续登录（踢掉其他设备）
  const conflict = page.locator('text=继续登录').first();
  if (await conflict.count()) {
    console.log('[*] 设备冲突，点击继续登录 ...');
    await conflict.click().catch(() => {});
    await page.waitForTimeout(4000);
  }

  if (/login|passport/i.test(page.url())) {
    console.log('[*] 登录中 ...');
    await page.screenshot({ path: path.join(__dirname, 'state', `laigu-login-${TAG}.png`) });
    const userInput = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="手机"], input[placeholder*="邮箱"]').locator('visible=true').first();
    const passInput = page.locator('input[type="password"]').locator('visible=true').first();
    const hasUser = await userInput.count();
    const hasPass = await passInput.count();
    console.log(`[*] 输入框: 账号=${hasUser} 密码=${hasPass}`);
    if (hasUser && hasPass) {
      await userInput.fill(USER);
      await passInput.fill(PASS);
      await page.waitForTimeout(400);
      // 协议勾选
      const agree = page.locator('text=同意').first();
      if (await agree.count()) {
        try {
          const box = await agree.boundingBox({ timeout: 2000 });
          if (box) await page.mouse.click(box.x - 18, box.y + box.height / 2);
        } catch { /* ignore */ }
      }
      const btn = page.locator('button:has-text("登录"), button:has-text("登 录")').first();
      if (await btn.count()) await btn.click().catch(() => {});
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      // 登录提交后可能出现设备冲突弹窗（确认按钮文案=登录，非 button 角色元素）
      try {
        const exact = page.locator(':text-is("登录")').last();
        await exact.waitFor({ state: 'visible', timeout: 4000 });
        console.log('[*] 设备冲突弹窗，点击确认登录 ...');
        await exact.click();
        await page.waitForTimeout(9000);
      } catch { /* 无弹窗 */ }
      console.log('[*] 登录后 url:', page.url());
      await page.screenshot({ path: path.join(__dirname, 'state', `laigu-after-login-${TAG}.png`) });
    }
  }

  // 登录态保存
  await ctx.storageState({ path: path.join(__dirname, 'state', `laigu-state-${TAG}.json`) }).catch(() => {});

  // 菜单结构
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('[class*=menu] li, [class*=Menu] li, [class*=nav] li, aside a, [class*=sider] a, [class*=sider] [class*=item]')]
      .map((el) => ({ text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24), href: el.getAttribute('href') || '' }))
      .filter((x) => x.text),
  ).catch(() => []);
  console.log('[*] 菜单:', JSON.stringify(menu.slice(0, 40), null, 1));

  const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)).catch(() => '');
  console.log('[*] 页面文本:', text);

  await page.screenshot({ path: path.join(__dirname, 'state', `laigu-dash-${TAG}.png`), fullPage: false });

  const uniq = apis.filter((a, i, arr) => arr.findIndex((x) => x.url === a.url && x.method === a.method) === i);
  fs.writeFileSync(OUT, JSON.stringify({ menu, apis: uniq }, null, 1));
  console.log(`\n[done] API ${uniq.length} 个 → ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
