// 展开 partner 侧栏全部子菜单，列出模块清单；发现笔记/内容类模块则进入探查
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
    if (/partner\.xiaohongshu\.com\/api/.test(req.url()) && req.postData()) {
      const u = req.url().replace('https://partner.xiaohongshu.com', '');
      if (/vision|note|content|report|clue/i.test(u)) {
        apiLog.push(`${u.slice(0, 110)}\n     ${req.postData().slice(0, 260)}`);
      }
    }
  });

  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(18000);

  const headers = page.locator('.d-new-menu__inner .d-sub-menu__header');
  const n = await headers.count();
  console.log('子菜单头数量:', n);

  for (let i = 0; i < n; i += 1) {
    const h = headers.nth(i);
    try {
      await h.click({ timeout: 4000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log(`[${i}] 展开失败 ${e.message.split('\n')[0]}`);
    }
  }
  // 收集全部菜单项文本 + href/可点击性
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('.d-new-menu__inner .d-menu-item, .d-new-menu__inner .d-sub-menu__item')]
      .map((el) => ({
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        cls: String(el.className).slice(0, 50),
      }))
      .filter((x) => x.text),
  );
  console.log('===== 菜单模块清单 =====');
  for (const it of items) console.log(`  ${it.text || '(图标)'}   [${it.cls}]`);

  // 找笔记/内容/数据相关项并进入
  const keywords = ['笔记', '内容', '数据', '报表', '报告'];
  const targets = items.filter((it) => keywords.some((k) => it.text.includes(k)));
  console.log('\n候选板块:', targets.map((t) => t.text).join(' | ') || '无');
  for (const t of targets.slice(0, 6)) {
    const el = page.locator(`.d-new-menu__inner >> text=${t.text}`).first();
    try {
      await el.click({ timeout: 4000 });
      await page.waitForTimeout(9000);
      console.log(`\n[进入] ${t.text} -> ${page.url()}`);
      console.log('  ', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
      await page.screenshot({ path: path.join(OUT, `sec-${t.text.slice(0, 12)}.png`) });
    } catch (e) {
      console.log(`[${t.text}] 进入失败 ${e.message.split('\n')[0]}`);
    }
  }

  console.log('\n===== 数据接口 =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 40) break;
  }
  await browser.close();
  process.exit(0);
})();
