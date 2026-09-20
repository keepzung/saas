// 深入子页面：点击侧边栏菜单，dump URL/表格列/导出按钮/API
// 用法: node explore-page.cjs <navText> <menuText>
//   例: node explore-page.cjs 数据 经营分析
//       node explore-page.cjs 资产 员工矩阵
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');
const NAV_URLS = {
  数据: 'https://mcc.xiaohongshu.com/micro/data-monitor?from=MENU',
  资产: 'https://mcc.xiaohongshu.com/micro/brand-manage',
  财务: 'https://mcc.xiaohongshu.com/micro/finance-fund-wallet',
  协作: 'https://mcc.xiaohongshu.com/micro/account-manage',
  设置: 'https://mcc.xiaohongshu.com/micro/org-manage',
};

(async () => {
  const [nav, menu, menu2] = [process.argv[2], process.argv[3], process.argv[4]];
  if (!nav || !menu) {
    console.error('usage: node explore-page.cjs <navText> <menuText> [menuText2]');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const apiHits = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (
      /xiaohongshu\.com\/(api|gw)\//i.test(url) &&
      !/apm-fe|spider-tracker|adsmessage/.test(url)
    ) {
      let body = '';
      try {
        body = (await res.text()).slice(0, 500);
      } catch {}
      apiHits.push({ status: res.status(), method: res.request().method(), url: url.slice(0, 250), body });
    }
  });

  console.log(`[*] goto ${nav}`);
  await page.goto(NAV_URLS[nav], { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  const item = page.locator(`text="${menu}"`).first();
  if (!(await item.count())) {
    console.log(`[!] menu not found: ${menu}`);
    await browser.close();
    process.exit(2);
  }
  console.log(`[*] clicking menu: ${menu}`);
  await page.locator(`text="${menu}"`).first().click({ timeout: 8000 }).catch((e) => console.log('click err:', e.message.split('\n')[0]));
  await page.waitForTimeout(2500);
  if (menu2) {
    console.log(`[*] clicking menu2: ${menu2}`);
    await page.locator(`text="${menu2}"`).first().click({ timeout: 8000 }).catch((e) => console.log('click2 err:', e.message.split('\n')[0]));
  }
  await page.waitForTimeout(8000);
  console.log(`URL: ${page.url()}\nTITLE: ${await page.title()}`);

  const info = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const tables = [...document.querySelectorAll('table')].filter(vis).map((t) => ({
      headers: [...t.querySelectorAll('th')].map((th) => norm(th.innerText)).filter(Boolean).slice(0, 40),
      rows: t.querySelectorAll('tbody tr').length,
    }));
    const exportBtns = [...document.querySelectorAll('button, [role=button], span, a')]
      .filter(vis)
      .map((el) => norm(el.innerText))
      .filter((t) => /导出|下载/.test(t) && t.length < 20);
    const subMenus = [...document.querySelectorAll('[class*=sider] [class*=item], [class*=menu] [class*=item]')]
      .filter(vis)
      .map((el) => norm(el.innerText).slice(0, 60))
      .filter(Boolean);
    const tabs = [...document.querySelectorAll('[class*=tab], [role=tab]')]
      .filter(vis)
      .map((el) => norm(el.innerText).slice(0, 30))
      .filter(Boolean);
    return {
      tables,
      exportBtns: [...new Set(exportBtns)],
      subMenus: [...new Set(subMenus)].slice(0, 40),
      tabs: [...new Set(tabs)].slice(0, 30),
      bodySnippet: norm(document.body.innerText).slice(0, 1500),
    };
  });

  console.log('\n===== TABLES =====');
  info.tables.forEach((t, i) => console.log(`  table${i} (${t.rows} rows): ${t.headers.join(' | ')}`));
  console.log('\n===== EXPORT BUTTONS =====');
  console.log(' ' + (info.exportBtns.join(' | ') || '(none)'));
  console.log('\n===== SUB MENUS =====');
  console.log(' ' + info.subMenus.join(' | '));
  console.log('\n===== TABS =====');
  console.log(' ' + info.tabs.join(' | '));
  console.log('\n===== BODY =====');
  console.log(info.bodySnippet);
  console.log('\n===== API HITS =====');
  for (const h of apiHits.slice(0, 40)) console.log(`  ${h.status} ${h.method} ${h.url}\n    ${h.body?.slice(0, 200)}`);

  const slug = page.url().replace(/[^a-z0-9]+/gi, '_').slice(0, 70);
  fs.writeFileSync(path.join(STATE_DIR, `page-${slug}.json`), JSON.stringify({ url: page.url(), info, apiHits }, null, 2));
  await page.screenshot({ path: path.join(STATE_DIR, `page-${slug}.png`), fullPage: true });
  console.log(`\n[DONE] saved page-${slug}.json/.png`);
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
