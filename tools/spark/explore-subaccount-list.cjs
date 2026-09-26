// 探索 partner 子账户列表页：/partner/subAccount-list（自包含自动登录）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
fs.mkdirSync(OUT, { recursive: true });

const ENV = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const USER = ENV.SPARK_ACCOUNT_TESLA;
const PASS = ENV.SPARK_PASSWORD_TESLA;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('response', async (res) => {
    const u = res.url().replace('https://partner.xiaohongshu.com', '');
    if (!/partner\.xiaohongshu\.com\/api/.test(u)) return;
    if (/message|feedback|announcement|grey|mind|flow|apm|tracker|decrypt|record|decryptEmail|preview_auth/.test(u)) return;
    let snippet = '';
    try {
      if (/json/i.test(res.headers()['content-type'] ?? '')) {
        snippet = (await res.text()).replace(/\s+/g, ' ').slice(0, 500);
      }
    } catch {}
    apiLog.push(`${res.status()} ${u.slice(0, 120)}\n     ${snippet}`);
  });

  console.log('[*] 登录 ...');
  await page.goto(
    'https://partner.xiaohongshu.com/login?service=https%3A%2F%2Fpartner.xiaohongshu.com%2Fpartner%2FsubAccount-list',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(3500);
  if (/login/i.test(page.url())) {
    const userInput = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').locator('visible=true').first();
    const passInput = page.locator('input[type="password"]').locator('visible=true').first();
    await userInput.fill(USER);
    await passInput.fill(PASS);
    await page.waitForTimeout(400);
    const agree = page.locator('text=我已阅读并同意').first();
    if (await agree.count()) {
      const bx = await agree.boundingBox({ timeout: 2000 }).catch(() => null);
      if (bx) await page.mouse.click(bx.x - 18, bx.y + bx.height / 2);
    }
    const btn = page.locator('button:has-text("登 录"), button:has-text("登录")').first();
    if (await btn.count()) await btn.click().catch(() => {});
    const dl = Date.now() + 60000;
    while (Date.now() < dl) {
      if (!/login/i.test(page.url())) break;
      await page.waitForTimeout(2500);
    }
  }
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(18000);
  console.log('[*] URL:', page.url());
  console.log('[*] 标题:', await page.title());
  const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500);
  console.log('[*] 页面文本:', text);
  await page.screenshot({ path: path.join(OUT, 'subaccount-list.png'), fullPage: true });

  // 表头结构
  const tableInfo = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('th')].map((t) => (t.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
    const trs = [...document.querySelectorAll('tbody tr')].slice(0, 3).map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => (td.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)),
    );
    return { ths, trs };
  });
  console.log('\n表头:', JSON.stringify(tableInfo.ths));
  console.log('首行样例:', JSON.stringify(tableInfo.trs));

  console.log('\n===== API =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 40) break;
  }
  await ctx.storageState({ path: path.join(OUT, 'partner-state-latest.json') });
  await browser.close();
  process.exit(0);
})();
