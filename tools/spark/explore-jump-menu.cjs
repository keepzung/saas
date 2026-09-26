// 查看 partner 顶部「跳转」菜单的链接目标（找聚光入口）
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
    storageState: path.join(__dirname, 'state', 'partner-full', 'partner-state-latest.json'),
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(15000);

  const jump = page.locator('text=跳转').first();
  if (!(await jump.count())) {
    console.log('未找到跳转按钮');
    await browser.close();
    process.exit(1);
  }
  await jump.hover({ timeout: 5000 }).catch(async () => {
    await jump.click({ timeout: 5000 }).catch(() => {});
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'jump-menu.png') });

  // dump 跳转浮层里的链接
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => ({ text: (a.innerText || '').trim().slice(0, 24), href: a.href }))
      .filter((x) => x.href && !/partner\.xiaohongshu\.com\/(partner|$)/.test(x.href) && x.text),
  );
  console.log('外部链接:');
  for (const l of links) console.log(`  ${l.text} -> ${l.href.slice(0, 100)}`);

  // 浮层 div 文本
  const overlay = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(
      (el) => el.offsetHeight > 40 && el.offsetHeight < 500 && /聚光|standard|e\.xiaohongshu|adm/.test(el.innerHTML) && el.innerText,
    );
    return els.slice(0, 2).map((el) => el.innerText.replace(/\s+/g, ' ').slice(0, 400));
  });
  console.log('浮层内容:', overlay);

  // 依次访问外部链接，记录 SSO 后落地页
  for (const l of links.slice(0, 5)) {
    try {
      console.log(`\n[访问] ${l.text} ${l.href}`);
      await page.goto(l.href, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(12000);
      console.log('  落地:', page.url().slice(0, 120));
      console.log('  标题:', await page.title());
      console.log('  文本:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 260));
      await page.screenshot({ path: path.join(OUT, `jump-${l.text.slice(0, 10)}.png`) });
    } catch (e) {
      console.log('  失败:', e.message.split('\n')[0]);
    }
  }
  await browser.close();
  process.exit(0);
})();
