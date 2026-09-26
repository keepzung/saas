// partner 平台全板块探索：按坐标点击侧栏图标，记录每板块 URL/文本/数据接口
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
fs.mkdirSync(OUT, { recursive: true });
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, 'state', 'partner-tesla-state.json'),
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    if (/\/api\//.test(req.url()) && req.postData()) {
      const u = req.url().replace('https://partner.xiaohongshu.com', '');
      if (/vision|report|note|content|clue|data|dashboard/i.test(u)) {
        apiLog.push({ section: currentSection, url: u.slice(0, 130), body: req.postData().slice(0, 400) });
      }
    }
  });
  let currentSection = 'dashboard';

  console.log('[*] 打开 watch-dashboard ...');
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(20000);

  // 侧栏结构 dump
  const sideHtml = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,nav,aside')].filter(
      (el) => el.offsetWidth >= 24 && el.offsetWidth <= 90 && el.offsetHeight > 350 && el.getBoundingClientRect().left < 90,
    );
    const smallest = els[els.length - 1] ?? els[0];
    return smallest ? smallest.outerHTML.slice(0, 3000) : 'NOT FOUND';
  });
  console.log('===== 侧栏 HTML（截断） =====');
  console.log(sideHtml);

  // 侧栏图标坐标点击（x≈24-40，y 从 80 到 520 每 44px 一档）
  for (let y = 88; y <= 530; y += 44) {
    try {
      currentSection = `icon@y=${y}`;
      await page.mouse.click(30, y);
      await page.waitForTimeout(7000);
      const url = page.url();
      const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      if (text.trim().length > 20 || !url.includes('watch-dashboard')) {
        await page.screenshot({ path: path.join(OUT, `sec-y${y}.png`) });
        console.log(`\n[y=${y}] ${url}`);
        console.log('  ', text);
      }
    } catch (e) {
      console.log(`[y=${y}] err ${e.message.split('\n')[0]}`);
    }
  }

  // 顶部「跳转」按钮
  try {
    currentSection = '跳转';
    await page.mouse.click(0, 0);
    await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);
    const jump = page.locator('text=跳转').first();
    if (await jump.count()) {
      await jump.click({ timeout: 3000 });
      await page.waitForTimeout(6000);
      console.log('\n[跳转后] URL:', page.url());
      console.log('  ', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
      await page.screenshot({ path: path.join(OUT, 'jump.png') });
    }
  } catch (e) {
    console.log('[跳转] err', e.message.split('\n')[0]);
  }

  console.log('\n===== 数据接口汇总 =====');
  const seen = new Set();
  for (const a of apiLog) {
    const key = a.url + a.body.slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`[${a.section}] ${a.url}\n     ${a.body}`);
    if (seen.size > 60) break;
  }
  fs.writeFileSync(path.join(OUT, 'all-apis.json'), JSON.stringify(apiLog, null, 1));
  await browser.close();
  process.exit(0);
})();
