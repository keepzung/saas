// 点击顶部导航进入各板块，dump 左侧栏菜单链接 + 页面结构
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto('https://mcc.xiaohongshu.com/micro/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);

  const dump = () =>
    page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const links = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        if (!vis(a)) continue;
        const text = norm(a.innerText).slice(0, 60);
        const href = a.getAttribute('href');
        if (!text || !href || href === '#') continue;
        const k = `${text}|${href}`;
        if (seen.has(k)) continue;
        seen.add(k);
        links.push({ text, href });
      }
      const body = norm(document.body.innerText);
      return {
        url: location.href,
        links: links.slice(0, 120),
        bodySnippet: body.slice(0, 800),
      };
    });

  const result = {};
  for (const nav of ['数据', '资产', '财务', '协作', '设置']) {
    const el = page.locator(`text="${nav}"`).first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: 5000 });
    } catch (e) {
      console.log(`[!] click ${nav} failed: ${e.message.split('\n')[0]}`);
      continue;
    }
    await page.waitForTimeout(5000);
    const info = await dump();
    result[nav] = info;
    console.log(`\n===== NAV: ${nav} -> ${info.url} =====`);
    for (const l of info.links) console.log(`  ${l.text}  ->  ${l.href}`);
    console.log('BODY:', info.bodySnippet.slice(0, 300));
    fs.writeFileSync(path.join(__dirname, 'state', `nav-${nav}.png`), '');
    await page.screenshot({ path: path.join(__dirname, 'state', `nav-${nav}.png`) });
    // 回首页继续
    await page.goto('https://mcc.xiaohongshu.com/micro/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  fs.writeFileSync(path.join(__dirname, 'state', 'nav-map.json'), JSON.stringify(result, null, 2));
  console.log('\n[DONE] saved state/nav-map.json');
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
