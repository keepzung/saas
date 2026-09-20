// 星火后台结构探测：菜单树 + 报表/导出入口盘点
// 用法: node explore.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');

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

  // 收集所有 XHR/Fetch JSON 响应，帮助定位数据接口
  const apiHits = [];
  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (
      /\/api\/|\/gw\/|edith|ark\.xiaohongshu|mcc\.xiaohongshu\.com\/(api|gw)/i.test(url) &&
      ct.includes('json') &&
      res.request().method() === 'GET'
    ) {
      apiHits.push({ status: res.status(), url: url.slice(0, 200) });
    }
  });

  const target = process.argv[2] || 'https://mcc.xiaohongshu.com';
  console.log(`[*] opening ${target}`);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log(`URL: ${page.url()}\nTITLE: ${await page.title()}`);

  const report = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // 左侧菜单 / 导航链接
    const links = [...document.querySelectorAll('a[href]')]
      .map((a) => ({ text: norm(a.innerText).slice(0, 40), href: a.getAttribute('href') }))
      .filter((l) => l.text && !/^#?$/.test(l.href));
    const dedup = [];
    const seen = new Set();
    for (const l of links) {
      const k = `${l.text}|${l.href}`;
      if (!seen.has(k)) {
        seen.add(k);
        dedup.push(l);
      }
    }
    // 菜单类元素（无 href 的 span/div 侧栏项）
    const menuItems = [...document.querySelectorAll('[class*=menu] li, [class*=sider] [class*=item], [class*=nav] [class*=item]')]
      .map((el) => norm(el.innerText).slice(0, 50))
      .filter(Boolean)
      .slice(0, 80);
    // 导出/下载/报表按钮
    const exportBtns = [...document.querySelectorAll('button, [role=button], span, a')]
      .map((el) => norm(el.innerText))
      .filter((t) => /导出|下载|报表|明细|Excel|CSV/.test(t) && t.length < 30);
    const bodyText = norm(document.body.innerText);
    return {
      links: dedup.slice(0, 150),
      menuItems: [...new Set(menuItems)].slice(0, 80),
      exportBtns: [...new Set(exportBtns)].slice(0, 40),
      bodySnippet: bodyText.slice(0, 1200),
    };
  });

  console.log('\n===== LINKS =====');
  for (const l of report.links) console.log(`  ${l.text}  ->  ${l.href}`);
  console.log('\n===== MENU ITEMS =====');
  console.log(report.menuItems.join(' | '));
  console.log('\n===== EXPORT BUTTONS =====');
  console.log(report.exportBtns.join(' | ') || '(none on this page)');
  console.log('\n===== BODY =====');
  console.log(report.bodySnippet);
  console.log('\n===== API HITS (first 30) =====');
  for (const h of apiHits.slice(0, 30)) console.log(`  ${h.status} ${h.url}`);

  const slug = (page.url().replace(/[^a-z0-9]+/gi, '_').slice(0, 60)) || 'page';
  fs.writeFileSync(
    path.join(STATE_DIR, `explore-${slug}.json`),
    JSON.stringify({ url: page.url(), ...report, apiHits }, null, 2),
  );
  await page.screenshot({ path: path.join(STATE_DIR, `explore-${slug}.png`), fullPage: false });

  await browser.close();
  console.log('\n[DONE]');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
