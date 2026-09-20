// 探测数据页（自动关闭引导浮层）
// 用法: node explore-url2.cjs <url> [waitMs]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');

(async () => {
  const url = process.argv[2];
  const waitMs = Number(process.argv[3] || 12000);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const apiHits = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/xiaohongshu\.com\/(api|gw)\//i.test(u) && !/apm-fe|spider-tracker|adsmessage|sec\/v1|cs\/check|apollo|question/.test(u)) {
      let body = '';
      try { body = (await res.text()).slice(0, 1500); } catch {}
      apiHits.push({ status: res.status(), method: res.request().method(), url: u.slice(0, 250), body });
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  for (const t of ['知道啦', '知道了', '立即体验', '我知道了']) {
    const btn = page.locator(`text="${t}"`).first();
    if (await btn.count()) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      console.log(`[*] dismissed: ${t}`);
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(waitMs);
  console.log(`URL: ${page.url()}\nTITLE: ${await page.title()}`);

  const info = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const tables = [...document.querySelectorAll('table')].filter(vis).map((t) => ({
      headers: [...t.querySelectorAll('th')].map((th) => norm(th.innerText)).filter(Boolean).slice(0, 60),
      rows: t.querySelectorAll('tbody tr').length,
    }));
    const exportBtns = [...new Set(
      [...document.querySelectorAll('button, [role=button], span, a')]
        .filter(vis)
        .map((el) => norm(el.innerText))
        .filter((t) => /导出|下载/.test(t) && t.length < 15),
    )];
    const tabs = [...new Set(
      [...document.querySelectorAll('[role=tab], [class*=tab]')]
        .filter(vis)
        .map((el) => norm(el.innerText).slice(0, 30))
        .filter(Boolean),
    )];
    return {
      tables,
      exportBtns,
      tabs: tabs.slice(0, 30),
      bodySnippet: norm(document.body.innerText).slice(0, 2500),
    };
  });

  console.log('\n===== TABS =====\n ' + (info.tabs.join(' | ') || '(none)'));
  console.log('\n===== TABLES =====');
  info.tables.forEach((t, i) => console.log(`  table${i} (${t.rows} rows):\n    ${t.headers.join(' | ')}`));
  console.log('\n===== EXPORT =====\n ' + (info.exportBtns.join(' | ') || '(none)'));
  console.log('\n===== BODY =====\n' + info.bodySnippet);
  console.log('\n===== BUSINESS APIS =====');
  for (const h of apiHits)
    if (/vision|report|staff|note|pro|clues|aurora|dashboard|matrix|lead|ratlin|cf_/.test(h.url))
      console.log(`  ${h.status} ${h.method} ${h.url}\n    ${h.body?.slice(0, 300)}`);

  const slug = page.url().replace(/[^a-z0-9]+/gi, '_').slice(0, 70);
  fs.writeFileSync(path.join(STATE_DIR, `url2-${slug}.json`), JSON.stringify({ url: page.url(), info, apiHits }, null, 2));
  await page.screenshot({ path: path.join(STATE_DIR, `url2-${slug}.png`), fullPage: true });
  console.log(`\n[DONE] url2-${slug}.json/.png`);
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
