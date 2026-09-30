// 定点：笔记表现页 URL + 笔记级 API（请求+响应都抓）
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro-note.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const OUT = path.join(__dirname, `state/pro-note-${TAG}.json`);
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

  const pairs = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('xiaohongshu.com')) return;
      if (!/\/api\/|edith|eros|proaccount/.test(url)) return;
      if (/spider-tracker|apm-fe|sec\/v1|collect|abtest|robin|help_cs|sbtsource|shield|im\/auth|wario|version\/check|authorize|apollo/.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 3000);
      const req = res.request();
      pairs.push({
        url: url.slice(0, 170),
        method: req.method(),
        postData: (req.postData() ?? '').slice(0, 1500),
        status: res.status(),
        body,
      });
    } catch { /* ignore */ }
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

  // 直接猜 URL：/app-datacenter/note-performance
  const candidates = [
    'https://pro.xiaohongshu.com/app-datacenter/note-performance',
    'https://pro.xiaohongshu.com/enterprise/data/note-performance',
    'https://pro.xiaohongshu.com/app-datacenter/note',
  ];
  let hitUrl = '';
  for (const u of candidates) {
    const before = pairs.length;
    console.log(`[try] ${u}`);
    await gotoRetry(u, 9000);
    const finalUrl = page.url();
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400)).catch(() => '');
    console.log(`  final=${finalUrl}\n  text=${text.slice(0, 150)}`);
    if (pairs.length > before || !/login|404|not found/i.test(finalUrl + text)) {
      if (/笔记|note/i.test(text) || pairs.length > before) {
        hitUrl = finalUrl;
        console.log('  ✓ 命中');
        break;
      }
    }
  }

  // 兜底：从首页点数据中心 → 笔记表现
  if (!hitUrl) {
    console.log('[fallback] 首页点击导航');
    await gotoRetry('https://pro.xiaohongshu.com/enterprise/home', 6000);
    try {
      await page.locator('text=数据中心').first().click({ timeout: 4000 });
      await page.waitForTimeout(1500);
      // 列出数据中心展开后的可点项
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('*')]
          .filter((el) => el.children.length === 0 && /^(笔记表现|粉丝数据|个人主页|员工数据)$/.test((el.innerText || '').trim()))
          .map((el) => ({ tag: el.tagName, text: el.innerText.trim(), cls: String(el.className).slice(0, 60) })),
      );
      console.log('  子项:', JSON.stringify(items));
      const noteEl = page.locator('text=笔记表现').first();
      await noteEl.click({ timeout: 6000 });
      await page.waitForTimeout(10000);
      hitUrl = page.url();
      console.log('  url:', hitUrl);
    } catch (e) {
      console.log('  fallback fail:', e.message.split('\n')[0]);
    }
  }

  const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)).catch(() => '');
  console.log(`\n[页面文本]\n${text}`);
  await page.screenshot({ path: path.join(__dirname, 'state', `pro-note-${TAG}.png`), fullPage: false });

  fs.writeFileSync(OUT, JSON.stringify({ hitUrl: hitUrl || page.url(), pairs }, null, 1));
  console.log(`\n[done] 请求/响应对 ${pairs.length} 条 → ${path.relative(process.cwd(), OUT)}`);
  for (const p of pairs) {
    if (/note|butterfly|data_center|proaccount/.test(p.url)) {
      console.log(`\n${p.method} ${p.url.slice(0, 130)}\n  REQ: ${p.postData || '(empty)'}\n  RES: ${p.body.slice(0, 400)}`);
    }
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
