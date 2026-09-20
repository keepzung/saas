// ARIA 快照指定 URL
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');

(async () => {
  const url = process.argv[2];
  const outFile = process.argv[3] || 'aria-snapshot.txt';
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  for (const t of ['知道啦', '知道了']) {
    const b = page.locator(`text="${t}"`).first();
    if (await b.count()) {
      await b.click({ timeout: 3000 }).catch(() => {});
      console.log('dismissed:', t);
    }
  }
  await page.waitForTimeout(3000);
  const snap = await page.locator('body').ariaSnapshot();
  fs.writeFileSync(path.join(__dirname, 'state', outFile), snap);
  console.log(snap.slice(0, 5000));
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
