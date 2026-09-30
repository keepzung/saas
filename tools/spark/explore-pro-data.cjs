// 定向抓取：笔记管理/笔记表现/员工数据/粉丝数据/个人主页 的 API
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro-data.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const OUT = path.join(__dirname, `state/pro-data-${TAG}.json`);
const TARGETS = (process.env.PAGES || '笔记管理,笔记表现,员工数据,粉丝数据,个人主页').split(',');
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
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('xiaohongshu.com')) return;
      if (!/\/api\/|edith|eros|proaccount|lead|galaxy|note/.test(url)) return;
      if (/spider-tracker|apm-fe|sec\/v1|collect|abtest|robin|help_cs|sbtsource|shield/.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 2500);
      apis.push({ url: url.slice(0, 180), method: res.request().method(), status: res.status(), body });
    } catch { /* ignore */ }
  });

  const gotoRetry = async (url, wait = 8000) => {
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

  await gotoRetry('https://pro.xiaohongshu.com/enterprise/home', 6000);

  const report = [];
  for (const name of TARGETS) {
    const before = apis.length;
    let ok = false;
    // 先展开父级再点子级：数据中心 → 笔记表现 等
    for (const parent of ['数据中心', '内容管理']) {
      try {
        const p = page.locator(`text=${parent}`).first();
        if (await p.count()) await p.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1200);
      } catch { /* ignore */ }
    }
    try {
      const el = page.locator(`text=${name}`).first();
      if (await el.count()) {
        await el.click({ timeout: 5000 });
        ok = true;
        await page.waitForTimeout(9000);
      }
    } catch (e) {
      console.log(`[click fail] ${name}: ${e.message.split('\n')[0]}`);
    }
    const url = page.url();
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)).catch(() => '');
    const captured = apis.slice(before);
    report.push({ name, ok, url, text: text.slice(0, 1000), apis: captured });
    console.log(`\n[${name}] ok=${ok} url=${url} +${captured.length} api`);
    console.log(`  文本: ${text.slice(0, 320)}`);
    for (const a of captured) console.log(`  ${a.method} ${a.url.slice(0, 110)} [${a.status}]`);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(`\n[done] → ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
