// 登录态浏览器捕获 orgCode：打开 MCC 首页（轻量），监听全部 /api/ 响应筛组织结构
// 用法: TAG=tesla2 NO_PROXY=1 node probe-org-capture.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const STATE_FILE = path.join(__dirname, `state/auth-${TAG}.json`);

const looksOrg = (v) =>
  v && typeof v === 'object' &&
  (v.accountOrgCode || v.orgCode || v.account_org_code);

const walk = (v, hits, src) => {
  if (!v || hits.length > 12) return;
  if (Array.isArray(v)) return v.forEach((x) => walk(x, hits, src));
  if (typeof v === 'object') {
    if (looksOrg(v)) {
      hits.push({
        src,
        orgCode: String(v.accountOrgCode ?? v.orgCode ?? v.account_org_code),
        name: v.accountOrgName ?? v.orgName ?? v.name ?? '',
      });
    }
    Object.values(v).forEach((x) => walk(x, hits, src));
  }
};

(async () => {
  const browser = await chromium.launch(process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {});
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const hits = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('xiaohongshu.com') || !url.includes('/api/')) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const j = await res.json().catch(() => null);
      if (j) walk(j, hits, url.replace('https://mcc.xiaohongshu.com', '').slice(0, 90));
    } catch { /* ignore */ }
  });

  const target = process.env.TARGET_URL || 'https://mcc.xiaohongshu.com/';
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`[*] goto attempt ${i} ...`);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
      break;
    } catch (e) {
      console.log(`[*] goto fail: ${e.message.split('\n')[0]}`);
      await page.waitForTimeout(4000);
    }
  }
  // 停留抓包 25s，期间尝试点一下组织切换器/用户区
  await page.waitForTimeout(8000);
  for (const sel of ['[class*=org]', '[class*=company]', '[class*=switch]', '[class*=user]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }
    } catch { /* ignore */ }
    if (hits.length) break;
  }
  await page.waitForTimeout(6000);

  const uniq = hits.filter((h, i, a) => a.findIndex((x) => x.orgCode === h.orgCode) === i);
  console.log(`\n[org 捕获] ${uniq.length} 个：`);
  for (const h of uniq) console.log(`  ${h.orgCode}  ${h.name}  <- ${h.src}`);
  if (!uniq.length) {
    await page.screenshot({ path: path.join(__dirname, 'state', `org-capture-${TAG}.png`), fullPage: false });
    console.log('未捕获到组织结构。截图 state/org-capture-' + TAG + '.png（请在页面右上角组织切换器里确认）');
  } else {
    fs.writeFileSync(path.join(__dirname, `state/org-${TAG}.json`), JSON.stringify(uniq, null, 1));
    console.log(`\n已存 state/org-${TAG}.json —— 取 orgCode 后执行：`);
    console.log(`node diag-tesla-mcc-fetch.cjs <orgCode>`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
