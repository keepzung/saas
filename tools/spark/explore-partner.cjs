// 蒲公英合作伙伴平台板块探索：等加载、遍历菜单、截图+记录数据接口
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-explore');
fs.mkdirSync(OUT, { recursive: true });
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, 'state', 'partner-tesla-state.json'),
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!/partner\.xiaohongshu\.com\/api/.test(url)) return;
    let snippet = '';
    try {
      if (/json/i.test(res.headers()['content-type'] ?? '')) {
        snippet = (await res.text()).replace(/\s+/g, ' ').slice(0, 220);
      }
    } catch {}
    apiLog.push(`${res.status()} ${url.replace('https://partner.xiaohongshu.com', '')}\n     ${snippet}`);
  });

  console.log('[*] 打开 watch-dashboard ...');
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(18000);
  await page.screenshot({ path: path.join(OUT, '01-dashboard.png') });
  console.log('[1] dashboard 文本:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 600));

  // 收集左侧菜单项
  const menuItems = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/partner/"], [class*=menu] li, [class*=Menu] li')]
      .map((el) => ({
        text: (el.innerText || '').trim().slice(0, 20),
        href: el.getAttribute('href') || '',
      }))
      .filter((x) => x.text && x.text.length <= 12),
  );
  console.log('[*] 菜单项:', JSON.stringify(menuItems.slice(0, 30)));

  // 逐个访问导航链接（最多10个）
  const links = [...new Set(menuItems.filter((m) => m.href && m.href.startsWith('/')).map((m) => m.href))].slice(0, 10);
  let idx = 2;
  for (const href of links) {
    try {
      console.log(`[*] 访问 ${href}`);
      await page.goto(`https://partner.xiaohongshu.com${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(9000);
      const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
      await page.screenshot({ path: path.join(OUT, `${String(idx).padStart(2, '0')}-${href.replace(/\//g, '_').slice(0, 40)}.png`) });
      console.log(`    文本: ${text}`);
      idx += 1;
    } catch (e) {
      console.log(`    失败: ${e.message.split('\n')[0]}`);
    }
  }

  console.log('===== API 汇总（去重前120条） =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split(' ')[1];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size >= 120) break;
  }
  await browser.close();
  process.exit(0);
})();
