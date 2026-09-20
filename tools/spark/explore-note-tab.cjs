// 笔记分析页：点「笔记明细分析」tab，设置日期范围，点查询，完整捕获请求/响应
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const hits = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/target_detail_list|target_card/.test(u)) {
      let body = '';
      try { body = await res.text(); } catch {}
      hits.push({
        url: u,
        reqBody: res.request().postData(),
        resBody: body.slice(0, 20000),
      });
    }
  });

  await page.goto('https://mcc.xiaohongshu.com/micro/note-data', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  for (const t of ['知道啦', '知道了']) {
    const b = page.locator(`text="${t}"`).first();
    if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(10000);

  // 点「笔记明细分析」tab
  const tab = page.locator('text=笔记明细分析').first();
  let tabTries = 0;
  while (!(await tab.count()) && tabTries < 6) {
    await page.waitForTimeout(5000);
    tabTries += 1;
    console.log(`[*] waiting for tab (try ${tabTries})`);
  }
  if (await tab.count()) {
    console.log('[*] clicking 笔记明细分析 tab');
    await tab.click({ timeout: 8000, force: true }).catch((e) => console.log('tab click err:', e.message.split('\n')[0]));
    await page.waitForTimeout(12000);
  } else {
    console.log('[!] tab not found');
    const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('BODY NOW:', bodyTxt.replace(/\s+/g, ' '));
  }

  // 尝试设置日期：找「笔记数据范围」输入框
  const dateInput = page.locator('input[placeholder*="日期"], input[placeholder*="范围"]').first();
  if (await dateInput.count()) {
    console.log('[*] date input found:', await dateInput.getAttribute('placeholder'));
    await dateInput.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // 尝试直接输入日期区间
    await page.keyboard.type('2026-08-20', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.keyboard.type('2026-09-19', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const queryBtn = page.locator('button:has-text("查询"), text=查询').first();
    if (await queryBtn.count()) {
      console.log('[*] clicking 查询');
      await queryBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(8000);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'state', 'note-tab-hits.json'), JSON.stringify(hits, null, 2));
  console.log(`[DONE] ${hits.length} hits`);
  for (const h of hits) {
    const body = h.reqBody || '';
    const dateMatch = body.match(/date_key[\s\S]{0,400}/);
    console.log(`\n### ${h.url.slice(-40)}`);
    console.log('  chart:', (body.match(/"chart":"(\w+)"/) || [])[1]);
    if (dateMatch) console.log('  date_key part:', dateMatch[0].slice(0, 400));
  }
  await page.screenshot({ path: path.join(__dirname, 'state', 'note-tab.png'), fullPage: true });
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
