// 抓聚光 rtb_metrics 的请求体
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, 'state/auth.json'),
    viewport: { width: 1600, height: 900 },
  });
  const page = await ctx.newPage();
  const hits = [];
  page.on('request', (req) => {
    if (/rtb_metrics($|\?)/.test(req.url()) && req.method() === 'POST') {
      hits.push({
        url: req.url(),
        body: req.postData(),
        headers: {
          ct: req.headers()['content-type'],
          origin: req.headers()['origin'],
          referer: req.headers()['referer'],
        },
      });
    }
  });
  await page.goto('https://mcc.xiaohongshu.com/micro/aurora-data', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  for (const t of ['知道啦', '知道了']) {
    const b = page.locator(`text="${t}"`).first();
    if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(20000);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(8000);
  fs.writeFileSync(path.join(__dirname, 'state/rtb-req.json'), JSON.stringify(hits, null, 2));
  console.log('hits:', hits.length);
  hits.forEach((h) => console.log('BODY:', h.body));
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
