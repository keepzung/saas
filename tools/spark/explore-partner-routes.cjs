// 访问 partner 效果数据/客户报表页，抓数据接口（找笔记级投放报表）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',')
  : ['/partner/performance-data', '/partner/customer-report-second-gen', '/partner/data-analysis'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(OUT, 'partner-state-latest.json'),
    viewport: { width: 1600, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    if (/partner\.xiaohongshu\.com\/api/.test(req.url()) && req.method() !== 'OPTIONS') {
      const u = req.url().replace('https://partner.xiaohongshu.com', '');
      if (/vision|report|note|effect|performance|data/i.test(u) || (req.postData() || '').includes('note')) {
        apiLog.push(`${req.method()} ${u.slice(0, 120)}\n     ${(req.postData() || '').slice(0, 350)}`);
      }
    }
  });

  for (const route of ROUTES) {
    console.log(`\n########## ${route} ##########`);
    try {
      await page.goto(`https://partner.xiaohongshu.com${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      await page.waitForTimeout(14000);
      const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 700);
      console.log('文本:', text);
      await page.screenshot({ path: path.join(OUT, `route-${route.replace(/\//g, '_').slice(-30)}.png`) });
      // 若有笔记相关 tab/按钮，点一下
      for (const kw of ['笔记报表', '笔记', '效果报表']) {
        const el = page.locator(`text=${kw}`).first();
        if (await el.count()) {
          await el.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(8000);
          console.log(`  [点击${kw}] 文本:`, (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
          break;
        }
      }
    } catch (e) {
      console.log('失败:', e.message.split('\n')[0]);
    }
  }

  console.log('\n===== 数据接口 =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 40) break;
  }
  await browser.close();
  process.exit(0);
})();
