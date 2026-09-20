// 抓指定页面的业务 API 请求体+响应体（request payload 完整记录）
// 用法: node capture-api.cjs <url> <urlRegex>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');

(async () => {
  const [url, re] = [process.argv[2], process.argv[3] || '.*'];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const hits = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (new RegExp(re, 'i').test(u)) {
      let body = '';
      try { body = await res.text(); } catch {}
      hits.push({
        url: u,
        method: res.request().method(),
        reqHeaders: res.request().headers(),
        reqBody: res.request().postData(),
        status: res.status(),
        resBody: body.slice(0, 5000),
      });
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  for (const t of ['知道啦', '知道了']) {
    const btn = page.locator(`text="${t}"`).first();
    if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(10000);

  const file = path.join(STATE_DIR, 'capture-last.json');
  fs.writeFileSync(file, JSON.stringify(hits, null, 2));
  console.log(`captured ${hits.length} hits -> ${file}`);
  for (const h of hits) {
    console.log(`\n### ${h.method} ${h.url}`);
    console.log('REQ BODY:', (h.reqBody || '').slice(0, 1200));
    console.log('RES BODY:', h.resBody.slice(0, 1200));
  }
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
