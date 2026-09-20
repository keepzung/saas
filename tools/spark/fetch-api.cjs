// 在登录态页面内直接 fetch 内部 API
// 用法: node fetch-api.cjs <method> <url> [jsonBody]
const { chromium } = require('playwright');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');

(async () => {
  let [method, url, body] = [process.argv[2], process.argv[3], process.argv[4]];
  if (!method || !url) {
    console.error('usage: node fetch-api.cjs <GET|POST> <url> [@bodyFile|json]');
    process.exit(1);
  }
  if (body && body.startsWith('@')) {
    body = require('fs').readFileSync(body.slice(1), 'utf8');
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto('https://mcc.xiaohongshu.com/micro/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body || undefined,
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    { method, url, body },
  );
  console.log('STATUS:', result.status);
  console.log(result.text.slice(0, 6000));
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
