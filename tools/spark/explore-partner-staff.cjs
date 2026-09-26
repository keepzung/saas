// partner 平台自动登录 + 侧栏 hover 探索（自包含：登录态失效也能跑）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
fs.mkdirSync(OUT, { recursive: true });

const ENV = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const USER = ENV.SPARK_ACCOUNT_TESLA;
const PASS = ENV.SPARK_PASSWORD_TESLA;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('response', async (res) => {
    const u = res.url().replace('https://partner.xiaohongshu.com', '');
    if (!/partner\.xiaohongshu\.com\/api/.test(u)) return;
    if (/message|feedback|announcement|grey|mind|flow|apm|tracker|decrypt|disclaimer|preview_auth|record|decryptEmail/.test(u)) return;
    let snippet = '';
    try {
      if (/json/i.test(res.headers()['content-type'] ?? '')) {
        snippet = (await res.text()).replace(/\s+/g, ' ').slice(0, 320);
      }
    } catch {}
    apiLog.push(`${res.status()} ${u.slice(0, 120)}\n     ${snippet}`);
  });

  console.log('[*] 登录 ...');
  await page.goto(
    'https://partner.xiaohongshu.com/login?service=https%3A%2F%2Fpartner.xiaohongshu.com%2Fpartner%2Fwatch-dashboard',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(3500);
  const userInput = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').locator('visible=true').first();
  const passInput = page.locator('input[type="password"]').locator('visible=true').first();
  await userInput.fill(USER);
  await passInput.fill(PASS);
  await page.waitForTimeout(400);
  const agree = page.locator('text=我已阅读并同意').first();
  if (await agree.count()) {
    const box = await agree.boundingBox({ timeout: 2000 }).catch(() => null);
    if (box) await page.mouse.click(box.x - 18, box.y + box.height / 2);
  }
  const btn = page.locator('button:has-text("登录"), button:has-text("登 录")').first();
  if (await btn.count()) await btn.click().catch(() => {});
  else await page.keyboard.press('Enter');
  // 等待离开登录页
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (!/login/i.test(page.url())) break;
    await page.waitForTimeout(2500);
  }
  console.log('[*] 登录后 URL:', page.url());
  await page.waitForTimeout(12000);

  // 等侧栏
  let menuReady = false;
  for (let t = 0; t < 12; t += 1) {
    const cnt = await page.locator('.d-new-menu__inner .d-sub-menu__header').count();
    if (cnt > 0) {
      menuReady = true;
      console.log(`[*] 侧栏就绪（${(t + 1) * 3}s）`);
      break;
    }
    await page.waitForTimeout(3000);
  }
  if (!menuReady) {
    console.log('[!] 侧栏未渲染:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
    await ctx.storageState({ path: path.join(OUT, 'partner-state-latest.json') });
    await browser.close();
    process.exit(1);
  }

  const headers = page.locator('.d-new-menu__inner .d-sub-menu__header');
  const n = await headers.count();
  console.log('子菜单头:', n);
  const found = [];
  for (let i = 0; i < n; i += 1) {
    try {
      const bx = await headers.nth(i).boundingBox();
      if (!bx || bx.width === 0) {
        console.log(`[${i}] 无可见区域（跳过）`);
        continue;
      }
      await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 6 });
      await page.waitForTimeout(1800);
      const flyout = await page.evaluate(() =>
        [...document.querySelectorAll('.d-menu-item, .d-sub-menu__item, [class*=menu] li')]
          .map((el) => ({ text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24), vis: el.offsetWidth > 0 }))
          .filter((x) => x.vis && x.text && x.text.length <= 20),
      );
      const uniq = [...new Map(flyout.map((f) => [f.text, f])).values()];
      if (uniq.length) {
        console.log(`[子菜单${i}]`, uniq.map((u) => u.text).join(' | '));
        found.push({ idx: i, items: uniq });
      } else {
        // 展开失败则点击一次再取
        await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
        await page.waitForTimeout(1800);
        const flyout2 = await page.evaluate(() =>
          [...document.querySelectorAll('.d-menu-item, .d-sub-menu__item, [class*=menu] li')]
            .map((el) => ({ text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24), vis: el.offsetWidth > 0 }))
            .filter((x) => x.vis && x.text && x.text.length <= 20),
        );
        const uniq2 = [...new Map(flyout2.map((f) => [f.text, f])).values()];
        if (uniq2.length) {
          console.log(`[子菜单${i}·点击]`, uniq2.map((u) => u.text).join(' | '));
          found.push({ idx: i, items: uniq2 });
        }
      }
    } catch (e) {
      console.log(`[${i}] ${e.message.split('\n')[0]}`);
    }
  }

  const kw = ['员工', '人员', '笔记', '内容', '专业号', '账号', '数据', '报表', '标准投', '聚光'];
  for (const grp of found) {
    for (const it of grp.items) {
      if (!kw.some((k) => it.text.includes(k))) continue;
      console.log(`\n>>> 进入「${it.text}」`);
      try {
        await page.locator(`.d-new-menu__inner >> text=${it.text}`).first().click({ timeout: 5000 });
        await page.waitForTimeout(12000);
        console.log('URL:', page.url());
        console.log('文本:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 700));
        await page.screenshot({ path: path.join(OUT, `sec-${it.text.slice(0, 10)}.png`) });
      } catch (e) {
        console.log('  失败:', e.message.split('\n')[0]);
      }
    }
  }

  console.log('\n===== API =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 50) break;
  }
  await ctx.storageState({ path: path.join(OUT, 'partner-state-latest.json') });
  console.log('[*] 最新登录态已存 partner-state-latest.json');
  await browser.close();
  process.exit(0);
})();
