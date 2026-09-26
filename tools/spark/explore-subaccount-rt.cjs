// 子账户列表：切「实时消费」视图抓数据 + 提取「跳转」链接
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
    viewport: { width: 1600, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    if (/partner\.xiaohongshu\.com\/api/.test(req.url()) && req.method() !== 'OPTIONS') {
      apiLog.push(`REQ ${req.method()} ${req.url().replace('https://partner.xiaohongshu.com', '').slice(0, 110)}\n     ${(req.postData() || '').slice(0, 300)}`);
    }
  });

  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(16000);

  // 1) 提取行内「跳转」链接
  const jumpLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a')]
      .filter((a) => (a.innerText || '').trim() === '跳转')
      .map((a) => ({ href: a.href, target: a.target }))
      .slice(0, 3),
  );
  console.log('跳转链接样例:', JSON.stringify(jumpLinks, null, 1));

  // 2) 切「实时消费」视图
  const rt = page.locator('text=实时消费').first();
  if (await rt.count()) {
    await rt.click({ timeout: 5000 }).catch((e) => console.log('实时消费点击失败:', e.message.split('\n')[0]));
    await page.waitForTimeout(12000);
    const ths = await page.evaluate(() =>
      [...document.querySelectorAll('th')].map((t) => (t.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean),
    );
    console.log('\n[实时消费] 表头:', JSON.stringify(ths));
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('tbody tr')].slice(0, 4).map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => (td.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)),
      ),
    );
    console.log('[实时消费] 行样例:');
    for (const r of rows) console.log('  ', JSON.stringify(r));
    await page.screenshot({ path: path.join(OUT, 'subaccount-rt.png'), fullPage: true });
  } else {
    console.log('未找到实时消费视图');
  }

  console.log('\n===== API =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 30) break;
  }
  await browser.close();
  process.exit(0);
})();
