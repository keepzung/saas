// 探索 partner「数据中心」「效果广告管理」板块，找笔记报表
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(OUT, 'partner-state-latest.json'),
    viewport: { width: 1600, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    if (/partner\.xiaohongshu\.com\/api|\/api\/vision/.test(req.url()) && req.method() !== 'OPTIONS') {
      const u = req.url().replace('https://partner.xiaohongshu.com', '');
      if (/report|note|data_center|datacenter|effect|customize/i.test(u) || req.postData()?.includes('note')) {
        apiLog.push(`${req.method()} ${u.slice(0, 120)}\n     ${(req.postData() || '').slice(0, 300)}`);
      }
    }
  });

  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(15000);

  // 展开侧栏（收起侧边栏按钮 → 展开）
  const expand = page.locator('text=收起侧边栏').first();
  if (await expand.count()) {
    await expand.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  for (const section of ['数据中心', '效果广告管理']) {
    console.log(`\n########## ${section} ##########`);
    const el = page.locator(`text=${section}`).first();
    if (!(await el.count())) {
      console.log('侧栏未见该板块');
      continue;
    }
    await el.click({ timeout: 5000 }).catch((e) => console.log('点击失败:', e.message.split('\n')[0]));
    await page.waitForTimeout(4000);
    // 展开后列出子项
    const subItems = await page.evaluate(() =>
      [...document.querySelectorAll('.d-new-menu__inner .d-menu-item, .d-new-menu__inner li')]
        .map((el2) => (el2.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20))
        .filter((t) => t && t.length <= 16),
    );
    console.log('子项:', [...new Set(subItems)].join(' | '));

    // 逐个进入含关键词的子项
    for (const kw of ['笔记', '报表', '数据报告', '效果']) {
      const sub = page.locator(`.d-new-menu__inner >> text=${kw}`).first();
      if (await sub.count()) {
        try {
          await sub.click({ timeout: 4000 });
          await page.waitForTimeout(10000);
          console.log(`\n[进入 ${kw}] URL:`, page.url().slice(0, 130));
          console.log('  文本:', (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500));
          await page.screenshot({ path: path.join(OUT, `sec-${section}-${kw}.png`) });
        } catch (e) {
          console.log(`  ${kw} 进入失败: ${e.message.split('\n')[0]}`);
        }
      }
    }
  }

  console.log('\n===== 相关 API =====');
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
