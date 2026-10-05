// partner 登录页结构探测（无头）：URL/表单/tabs/按钮/协议勾选 → 截图
const { createRequire } = require('module');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'backend', 'package.json'));
let chromium;
try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('playwright-core')); }
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN', viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(10000);
  console.log('url:', page.url().slice(0, 90));
  const dump = [];
  for (const f of page.frames()) {
    const n = await f.locator('input').count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = f.locator('input').nth(i);
      dump.push({
        frame: f.url().slice(0, 50),
        type: await el.getAttribute('type').catch(() => null),
        placeholder: await el.getAttribute('placeholder').catch(() => null),
        visible: await el.isVisible().catch(() => false),
      });
    }
  }
  console.log('inputs:', JSON.stringify(dump, null, 0));
  const tabs = await page.locator('text=/账号登录|密码登录|短信登录|扫码登录|二维码登录/').allInnerTexts().catch(() => []);
  console.log('tabs:', JSON.stringify(tabs));
  const btns = await page.locator('button:visible').allInnerTexts().catch(() => []);
  console.log('visible buttons:', JSON.stringify(btns.slice(0, 10)));
  const cbs = await page.locator('input[type="checkbox"]').count().catch(() => 0);
  console.log('checkboxes:', cbs);
  await page.screenshot({ path: path.join(process.env.TEMP || '/tmp', 'partner-login.png'), fullPage: false }).catch(() => {});
  console.log('shot saved');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
