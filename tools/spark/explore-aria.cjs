// ARIA 快照：获取整页可访问性树，定位菜单结构
const { chromium } = require('playwright');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const NAV_URLS = {
  资产: 'https://mcc.xiaohongshu.com/micro/brand-manage',
  数据: 'https://mcc.xiaohongshu.com/micro/data-monitor?from=MENU',
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const nav = process.argv[2] || '资产';
  await page.goto(NAV_URLS[nav], { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  const snap = await page.locator('body').ariaSnapshot();
  console.log(`===== ARIA SNAPSHOT (${nav}) =====`);
  console.log(snap.slice(0, 9000));
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
