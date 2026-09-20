// 逐个悬停顶部导航，dump 展开的子菜单
const { chromium } = require('playwright');
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

  const dumpVisible = (label) =>
    page.evaluate((lbl) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const links = [...document.querySelectorAll('a[href]')]
        .filter(vis)
        .map((a) => ({ text: norm(a.innerText).slice(0, 50), href: a.getAttribute('href') }))
        .filter((l) => l.text);
      const items = [...document.querySelectorAll('[class*=menu] [class*=item], [class*=dropdown], [class*=popover]')]
        .filter(vis)
        .map((el) => norm(el.innerText).slice(0, 200))
        .filter(Boolean);
      return { lbl, links: links.slice(0, 100), popovers: [...new Set(items)].slice(0, 30) };
    }, label);

  const NAVS = ['数据', '资产', '财务', '协作', '设置'];
  const result = [];
  for (const nav of NAVS) {
    const el = page.locator(`nav >> text=${nav}`).first();
    const fallback = page.locator(`text="${nav}"`).first();
    const target = (await el.count()) ? el : fallback;
    if (!(await target.count())) {
      console.log(`[!] nav not found: ${nav}`);
      continue;
    }
    try {
      await target.hover({ timeout: 5000 });
    } catch {
      try { await target.click({ timeout: 5000 }); } catch {}
    }
    await page.waitForTimeout(1500);
    const dump = await dumpVisible(nav);
    result.push(dump);
    console.log(`\n===== NAV: ${nav} =====`);
    const seen = new Set();
    for (const l of dump.links) {
      const k = `${l.text}|${l.href}`;
      if (seen.has(k) || !l.href || l.href === '#') continue;
      seen.add(k);
      console.log(`  ${l.text}  ->  ${l.href}`);
    }
    if (dump.popovers.length) console.log('POPOVER:', dump.popovers.join(' || ').slice(0, 600));
  }

  require('fs').writeFileSync(path.join(__dirname, 'state', 'menu-map.json'), JSON.stringify(result, null, 2));
  console.log('\n[DONE] saved state/menu-map.json');
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
