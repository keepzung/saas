// 抓专业号数据页的【请求体】：员工数据/笔记表现/butterfly
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro-req.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const OUT = path.join(__dirname, `state/pro-req-${TAG}.json`);
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

  const reqs = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('xiaohongshu.com')) return;
    if (!/\/api\/|edith|eros|proaccount/.test(url)) return;
    if (/spider-tracker|apm-fe|sec\/v1|collect|abtest|robin|help_cs|sbtsource|shield|im\/auth|wario/.test(url)) return;
    const postData = req.postData();
    if (req.method() !== 'POST' && !/kos|butterfly|data_center|note|proaccount|staff/.test(url)) return;
    reqs.push({ url: url.slice(0, 170), method: req.method(), postData: (postData ?? '').slice(0, 1200) });
  });

  const gotoRetry = async (url, wait = 8000) => {
    for (let i = 1; i <= 4; i++) {
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

  // 直接进员工数据页（URL 已知）
  console.log('[1] 员工数据 /enterprise/data/get-customer');
  await gotoRetry('https://pro.xiaohongshu.com/enterprise/data/get-customer', 10000);
  // 切换 近7日/近30日 触发带时间参的请求
  for (const tab of ['近7日', '近30日']) {
    try {
      const el = page.locator(`text=${tab}`).first();
      if (await el.count()) { await el.click({ timeout: 3000 }); await page.waitForTimeout(4000); }
    } catch { /* ignore */ }
  }

  console.log('[2] 笔记表现（数据中心子项）');
  for (const parent of ['数据中心']) {
    try { await page.locator(`text=${parent}`).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); } catch { /* ignore */ }
  }
  try {
    await page.locator('text=笔记表现').first().click({ timeout: 5000 });
    await page.waitForTimeout(10000);
    console.log('  url:', page.url());
  } catch (e) { console.log('  笔记表现 click fail:', e.message.split('\n')[0]); }

  console.log('[3] 笔记管理（内容管理子项）');
  try { await page.locator('text=内容管理').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); } catch { /* ignore */ }
  try {
    await page.locator('text=笔记管理').first().click({ timeout: 5000 });
    await page.waitForTimeout(10000);
    console.log('  url:', page.url());
  } catch (e) { console.log('  笔记管理 click fail:', e.message.split('\n')[0]); }

  fs.writeFileSync(OUT, JSON.stringify(reqs, null, 1));
  console.log(`\n[done] 请求 ${reqs.length} 条 → ${path.relative(process.cwd(), OUT)}`);
  for (const r of reqs) {
    if (/kos|butterfly|data_center|note/.test(r.url)) {
      console.log(`\n${r.method} ${r.url.slice(0, 120)}\n  BODY: ${r.postData || '(empty)'}`);
    }
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
