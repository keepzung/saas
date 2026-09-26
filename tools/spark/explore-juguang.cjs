// 用 partner 会话直接访问聚光平台（e.xiaohongshu.com），检测 SSO 与报表入口
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(OUT, 'partner-state-latest.json'),
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/\/api\//.test(u) && /report|note|suning|kam/i.test(u) && req.method() !== 'OPTIONS') {
      apiLog.push(`${req.method()} ${u.slice(0, 130)}`);
    }
  });

  for (const host of ['https://e.xiaohongshu.com', 'https://e.xiaohongshu.com/np/agent/dashboard', 'https://adm.xiaohongshu.com']) {
    try {
      console.log(`\n[*] 访问 ${host}`);
      await page.goto(host, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(12000);
      console.log('  落地:', page.url().slice(0, 130));
      console.log('  标题:', await page.title());
      const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      console.log('  文本:', text);
      await page.screenshot({ path: path.join(OUT, `juguang-${host.replace(/\W+/g, '_').slice(-24)}.png`) });
      if (/login|passport/i.test(page.url())) {
        console.log('  -> 需要 SSO 登录（partner 会话不互通）');
      }
    } catch (e) {
      console.log('  失败:', e.message.split('\n')[0]);
    }
  }
  console.log('\n报表相关 API:');
  for (const l of [...new Set(apiLog)].slice(0, 30)) console.log(' ', l);
  await browser.close();
  process.exit(0);
})();
