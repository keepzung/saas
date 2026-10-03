const path = require('path');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));
const BASE = 'http://localhost:5173';
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};
const login = async (page, companyText) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入账号"]', '18600104701');
  await page.fill('input[placeholder="请输入密码"]', 'yoyo0508');
  await page.click('button:has-text("登 录"), button:has-text("登录")');
  await page.waitForTimeout(2200);
  const card = page.locator('.company-card', { hasText: companyText }).first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(600);
    await page.click('.action-confirm');
    await page.waitForTimeout(2200);
  }
  return page.evaluate(() => localStorage.getItem('current_brand_id'));
};
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const brand = await login(page, '东风奕境');
  ok('login brand7', brand === '7', `brand=${brand}`);

  await page.goto(`${BASE}/content-pro/content-factory/xhs-image-text-batch`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  ok('batch tabs', await page.isVisible('text=批量任务结果'));
  ok('batch matrix head', await page.isVisible('text=策略选择和数量设定'));
  ok('batch overview', await page.isVisible('text=生成概览'));
  ok('batch quota badge', await page.isVisible('text=可用算力'));
  const rowCount = await page.$$eval('.tr:not(.tr-head)', (els) => els.length);
  ok('batch matrix rows', rowCount >= 5, `rows=${rowCount}`);

  await page.click('.bt-tabs button:has-text("批量任务结果")');
  await page.waitForTimeout(1800);
  ok('result pending tab', await page.isVisible('text=待处理 ('));
  ok('result moved tab', await page.isVisible('text=已移入内容包 ('));
  ok('result discarded tab', await page.isVisible('text=已废弃 ('));

  await page.goto(`${BASE}/content-pro/package`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const cardCount = (await page.$$('.pkg-card')).length;
  ok('pkg page cards', cardCount >= 1, `cards=${cardCount}`);
  ok('pkg stats row', await page.isVisible('text=过审待领用'));

  await page.goto(`${BASE}/content-pro/package/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  ok('pkg detail table', await page.isVisible('text=当前指派达人'));
  ok('pkg detail tabs', await page.isVisible('text=已通过 ('));

  await page.goto(`${BASE}/content-pro/audit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  ok('audit page', await page.isVisible('text=批量通过'));
  await page.goto(`${BASE}/content-pro/claim-log`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  ok('claim log page', await page.isVisible('text=领用时间'));

  await page.goto(`${BASE}/content-pro/hot-content`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const statN = (await page.$$('.hc-stat')).length;
  const hotN = (await page.$$('.hot-card')).length;
  ok('hot content stats', statN >= 5, `stats=${statN}`);
  ok('hot content grid', hotN >= 1, `cards=${hotN}`);
  ok('hot wordcloud', await page.isVisible('text=关键词词云'));

  ok('tabbar quota', await page.isVisible('.wt-quota'));

  // H5（同 context 共享登录态）
  const h5 = await context.newPage();
  await h5.setViewportSize({ width: 390, height: 844 });
  h5.on('pageerror', (e) => errors.push('H5 ' + String(e)));
  await h5.goto(`${BASE}/m/kox-task/task-list`, { waitUntil: 'networkidle' });
  await h5.waitForTimeout(2200);
  ok('h5 tabs', await h5.isVisible('text=内容包领用'));
  await h5.click('.mt-tabs button:has-text("内容包领用")');
  await h5.waitForTimeout(2000);
  ok('h5 pkg section', (await h5.$('.pkg-card')) !== null || (await h5.$('.pkg-item')) !== null);
  await h5.close();

  // brand1 回归（同 context 清 localStorage 重登）
  const b1 = await login(page, 'Marketine');
  ok('login brand1', b1 === '1', `brand=${b1}`);
  await page.goto(`${BASE}/welcome`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok('brand1 no factory tab', !(await page.$('.workspace-tabbar')));

  ok('zero pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('UI SMOKE DONE');
})().catch((e) => { console.error('ui smoke error:', e); process.exitCode = 1; });