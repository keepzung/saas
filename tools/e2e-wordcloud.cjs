// 词云 E2E 验证（本地 dev）：登录态注入 → 内容表现分析页 → 词云渲染/控制台检查
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');
const req = createRequire(path.join(process.cwd(), 'backend', 'package.json'));
let chromium;
try { ({ chromium } = req('playwright')); } catch {
  const pc = req('playwright-core');
  const base = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  let exe = null;
  for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const c = path.join(base, d, sub, 'chrome.exe');
      if (fs.existsSync(c)) { exe = c; break; }
    }
    if (exe) break;
  }
  chromium = { launch: (o) => pc.chromium.launch({ ...o, executablePath: exe || undefined }) };
}

(async () => {
  const token = process.argv[2];
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(([t]) => { localStorage.setItem('token', t); localStorage.setItem('current_brand_id', '6'); }, [token]);
  await page.goto('http://localhost:5173/kox_df/operation-analysis/note-ranking', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(12000);

  const hasCard = await page.locator('.wordcloud-card').count();
  const canvasCount = await page.locator('.wordcloud-card canvas').count();
  const mode = await page.evaluate(() => document.querySelector('.wordcloud-card') ? 'rendered' : 'missing');
  const cloudVisible = await page.locator('.wordcloud-chart').isVisible().catch(() => false);
  console.log(`wordcloud-card: ${hasCard}, mode: ${mode}, canvas: ${canvasCount}, chart-visible: ${cloudVisible}`);
  await page.screenshot({ path: path.join(process.env.TEMP, 'wordcloud-e2e.png'), fullPage: false });
  console.log('console errors:', errors.length ? JSON.stringify(errors.slice(0, 5), null, 1) : 'none');
  await browser.close();
})().catch((e) => { console.error('e2e error:', e.message); process.exit(1); });
