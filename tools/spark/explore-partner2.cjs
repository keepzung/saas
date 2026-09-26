// 深度探索 partner 平台：等长加载 + 点击左侧图标菜单 + 抓数据接口
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
    if (!/partner\.xiaohongshu\.com\/api|\/api\/edith/.test(url)) return;
    if (/flow\/mind|message\/info|feedback|announcement|disclaimer|grey|welcome|question/.test(url)) return;
    let snippet = '';
    try {
      if (/json/i.test(res.headers()['content-type'] ?? '')) {
        snippet = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
      }
    } catch {}
    apiLog.push(`--- ${res.status()} ${url.replace('https://partner.xiaohongshu.com', '').slice(0, 120)}\n    ${snippet}`);
  });

  console.log('[*] 打开 dashboard，等 25s ...');
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(25000);
  await page.screenshot({ path: path.join(OUT, '10-dashboard-loaded.png') });
  console.log('[dashboard] 文本:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 800));
  console.log('[dashboard] URL:', page.url());

  // 左侧图标菜单：定位侧栏容器内可点击项
  const sideItems = page.locator('aside li, [class*=sider] li, [class*=sidebar] li, [class*=side-menu] li').locator('visible=true');
  const n = Math.min(await sideItems.count(), 12);
  console.log('[*] 侧栏项数量:', n);
  for (let i = 0; i < n; i += 1) {
    const item = sideItems.nth(i);
    try {
      const before = page.url();
      await item.click({ timeout: 4000 });
      await page.waitForTimeout(12000);
      const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
      const shot = path.join(OUT, `20-menu-${i}.png`);
      await page.screenshot({ path: shot });
      console.log(`\n[菜单${i}] ${before} -> ${page.url()}`);
      console.log(`  文本: ${text}`);
    } catch (e) {
      console.log(`[菜单${i}] 点击失败: ${e.message.split('\n')[0]}`);
    }
  }

  console.log('\n===== 数据接口汇总 =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size >= 80) break;
  }
  await browser.close();
  process.exit(0);
})();
