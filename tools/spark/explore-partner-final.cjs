// partner 全板块终探：实时消费视图 + 内容管理 + 数据中心（每步清遮罩）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state', 'partner-full');
fs.mkdirSync(OUT, { recursive: true });
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function clearOverlays(page) {
  return page
    .evaluate(() => {
      document
        .querySelectorAll(
          '.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], .d-modal-mask, .d-modal, [class*=notice]',
        )
        .forEach((e) => e.remove());
      return true;
    })
    .catch(() => false);
}

async function dumpPage(page, tag) {
  await clearOverlays(page);
  await page.waitForTimeout(800);
  const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 900);
  const ths = await page.evaluate(() =>
    [...document.querySelectorAll('th')].map((t) => (t.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean),
  );
  const row1 = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr');
    return tr ? [...tr.querySelectorAll('td')].map((td) => (td.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 26)) : [];
  });
  console.log(`\n[${tag}] URL: ${page.url().slice(0, 120)}`);
  console.log(`[${tag}] 表头:`, JSON.stringify(ths));
  console.log(`[${tag}] 首行:`, JSON.stringify(row1).slice(0, 500));
  console.log(`[${tag}] 文本:`, text);
  await page.screenshot({ path: path.join(OUT, `final-${tag}.png`) });
}

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
    if (/partner\.xiaohongshu\.com\/api/.test(req.url()) && req.method() !== 'OPTIONS') {
      const u = req.url().replace('https://partner.xiaohongshu.com', '');
      if (/note|content|report|data/i.test(u) || (req.postData() || '').toLowerCase().includes('note')) {
        apiLog.push(`${req.method()} ${u.slice(0, 120)}\n     ${(req.postData() || '').slice(0, 350)}`);
      }
    }
  });

  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(16000);
  await clearOverlays(page);

  // 1) 实时消费视图
  console.log('===== 1) 实时消费视图 =====');
  const rt = page.locator('text=实时消费').first();
  if (await rt.count()) {
    await clearOverlays(page);
    await rt.click({ timeout: 5000 }).catch((e) => console.log('点击失败:', e.message.split('\n')[0]));
    await page.waitForTimeout(12000);
    await dumpPage(page, '实时消费');
  } else {
    console.log('未见实时消费入口');
  }

  // 2) 内容管理
  console.log('\n===== 2) 内容管理 =====');
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(12000);
  await clearOverlays(page);
  const cm = page.locator('text=内容管理').first();
  if (await cm.count()) {
    await cm.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await clearOverlays(page);
    const subs = await page.evaluate(() =>
      [...document.querySelectorAll('.d-new-menu__inner .d-menu-item, .d-new-menu__inner li')]
        .map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20))
        .filter((t) => t && t.length <= 16),
    );
    console.log('内容管理子项:', [...new Set(subs)].join(' | '));
    for (const kw of ['笔记', '内容', '素材']) {
      const sub = page.locator(`.d-new-menu__inner >> text=${kw}`).first();
      if (await sub.count()) {
        await sub.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(10000);
        await dumpPage(page, `内容管理-${kw}`);
        break;
      }
    }
  } else {
    console.log('未见内容管理');
  }

  // 3) 数据中心
  console.log('\n===== 3) 数据中心 =====');
  const dc = page.locator('text=数据中心').first();
  if (await dc.count()) {
    await clearOverlays(page);
    await dc.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await clearOverlays(page);
    const subs = await page.evaluate(() =>
      [...document.querySelectorAll('.d-new-menu__inner .d-menu-item, .d-new-menu__inner li')]
        .map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20))
        .filter((t) => t && t.length <= 16),
    );
    console.log('数据中心子项:', [...new Set(subs)].join(' | '));
    for (const kw of ['笔记', '报表', '数据报告', '效果']) {
      const sub = page.locator(`.d-new-menu__inner >> text=${kw}`).first();
      if (await sub.count()) {
        await sub.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(10000);
        await dumpPage(page, `数据中心-${kw}`);
        break;
      }
    }
  } else {
    console.log('未见数据中心');
  }

  console.log('\n===== 笔记相关 API =====');
  const seen = new Set();
  for (const line of apiLog) {
    const key = line.split('\n')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (seen.size > 30) break;
  }
  await ctx.storageState({ path: path.join(OUT, 'partner-state-latest.json') });
  await browser.close();
  process.exit(0);
})();
