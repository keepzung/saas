// 专业号平台板块遍历：抓导航链接 → 逐页访问并捕获 API + 页面文本
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro-pages.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const OUT = path.join(__dirname, `state/pro-pages-${TAG}.json`);
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, `state/auth-${TAG}.json`),
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  let apis = [];
  const hook = () => {
    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!/pro\.xiaohongshu\.com\/(api|gateway)/.test(url) && !/edith|eros|proaccount|lead/.test(url)) return;
        const ct = res.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        const body = (await res.text().catch(() => '')).slice(0, 1200);
        apis.push({ url: url.replace('https://pro.xiaohongshu.com', '').slice(0, 160), method: res.request().method(), status: res.status(), body });
      } catch { /* ignore */ }
    });
  };
  hook();

  const goto = async (url, wait = 9000) => {
    for (let i = 1; i <= 3; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        break;
      } catch (e) {
        console.log(`  [goto retry ${i}] ${e.message.split('\n')[0]}`);
        await page.waitForTimeout(3000);
      }
    }
    await page.waitForTimeout(wait);
  };

  // 1) 首页收集导航链接
  await goto('https://pro.xiaohongshu.com/enterprise/home', 6000);
  const navs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => ({ href: a.href, text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20) }))
      .filter((x) => x.href.includes('pro.xiaohongshu.com') && x.text),
  );
  console.log('[navs]', JSON.stringify(navs.slice(0, 30), null, 1));

  // 2) 主要板块逐个访问
  const visited = [];
  const seen = new Set(['https://pro.xiaohongshu.com/enterprise/home']);
  const interesting = navs.filter(
    (n) => /content|data|marketing|analysis|staff|employee|note|lead|manage|center/i.test(n.href) && !seen.has(n.href),
  );
  for (const n of interesting.slice(0, 12)) {
    if (seen.has(n.href)) continue;
    seen.add(n.href);
    const before = apis.length;
    console.log(`\n[page] ${n.text} ${n.href}`);
    await goto(n.href, 8000);
    const texts = await page
      .evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 700))
      .catch(() => '');
    visited.push({ name: n.text, url: n.href, text: texts, newApis: apis.length - before });
    console.log(`  文本: ${texts.slice(0, 200)}`);
  }

  const uniq = apis.filter(
    (a, i, arr) => arr.findIndex((x) => x.url === a.url && x.method === a.method) === i,
  );
  fs.writeFileSync(OUT, JSON.stringify({ visited, apis: uniq }, null, 1));
  console.log(`\n[done] API ${uniq.length} 个 → ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
