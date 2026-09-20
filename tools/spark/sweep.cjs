// 遍历侧边栏所有叶子菜单，记录每个页面的 URL/表格/导出/API
// 用法: node sweep.cjs <navName>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');
const NAV_URLS = {
  数据: 'https://mcc.xiaohongshu.com/micro/data-monitor?from=MENU',
  资产: 'https://mcc.xiaohongshu.com/micro/brand-manage',
};

(async () => {
  const nav = process.argv[2] || '数据';
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(NAV_URLS[nav], { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);

  // 先展开所有分组（点击当前未激活的组标题）
  const groupTexts = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    // 侧栏菜单容器：找包含已知菜单文本的容器
    const candidates = [...document.querySelectorAll('nav, [class*=menu], [class*=sider], aside')].filter(vis);
    const sider = candidates.find((c) => /盯盘工具|品牌资产/.test(norm(c.innerText))) || candidates[candidates.length - 1];
    if (!sider) return [];
    // 组标题：包含子菜单的项或带展开箭头的项 —— 简化：取所有直属文本块
    return [...sider.querySelectorAll('*')]
      .filter((el) => el.children.length <= 2 && vis(el))
      .map((el) => norm(el.innerText).slice(0, 40))
      .filter((t) => t && t.length <= 20);
  });
  console.log('[*] sidebar texts sample:', [...new Set(groupTexts)].slice(0, 40).join(' / '));

  const results = [];
  const leaves = [...new Set(groupTexts)].filter(
    (t) => !/首页|数据|资产|财务|协作|设置|收起/.test(t) && t.length <= 12,
  );
  for (const leaf of leaves) {
    try {
      const el = page.locator(`text="${leaf}"`).first();
      if (!(await el.count())) continue;
      await el.click({ timeout: 5000 });
      await page.waitForTimeout(6000);
      const url = page.url();
      const info = await page.evaluate(() => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const tables = [...document.querySelectorAll('table')].filter(vis).map((t) => ({
          headers: [...t.querySelectorAll('th')].map((th) => norm(th.innerText)).filter(Boolean).slice(0, 40),
          rows: t.querySelectorAll('tbody tr').length,
        }));
        const exportBtns = [...new Set(
          [...document.querySelectorAll('button, [role=button], span, a')]
            .filter(vis)
            .map((el) => norm(el.innerText))
            .filter((t) => /导出|下载/.test(t) && t.length < 15),
        )];
        return { tables, exportBtns, body: norm(document.body.innerText).slice(0, 400) };
      });
      const rec = { menu: leaf, url, ...info };
      results.push(rec);
      console.log(`\n### ${leaf} -> ${url}`);
      info.tables.forEach((t) => console.log(`   table(${t.rows}): ${t.headers.join(' | ').slice(0, 500)}`));
      if (info.exportBtns.length) console.log('   EXPORT:', info.exportBtns.join(' | '));
      await page.screenshot({ path: path.join(STATE_DIR, `sweep-${leaf}.png`) });
      // 回到 nav 起点继续
      await page.goto(NAV_URLS[nav], { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(4000);
    } catch (e) {
      console.log(`[!] ${leaf}: ${e.message.split('\n')[0]}`);
    }
  }

  fs.writeFileSync(path.join(STATE_DIR, `sweep-${nav}.json`), JSON.stringify(results, null, 2));
  console.log(`\n[DONE] sweep-${nav}.json (${results.length} pages)`);
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
