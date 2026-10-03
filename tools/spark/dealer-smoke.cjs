const path = require('path');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入账号"]', '18600104701');
  await page.fill('input[placeholder="请输入密码"]', 'yoyo0508');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2200);
  const card = page.locator('.company-card', { hasText: '东风奕境' }).first();
  await card.click(); await page.waitForTimeout(500);
  await page.click('.action-confirm'); await page.waitForTimeout(2000);

  // 侧栏（修复后）
  await page.goto('http://localhost:5173/content-pro/workbench', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const sider = await page.evaluate(() => {
    const s = document.querySelector('.sider');
    const items = s ? s.querySelectorAll('.ant-menu-submenu, .ant-menu-item') : [];
    return { count: items.length, text: (s?.innerText || '').replace(/\n/g, '|'), bg: s ? getComputedStyle(document.querySelector('.side-nav')).backgroundColor : '' };
  });
  ok('factory sider restored', sider.count >= 9, `count=${sider.count} bg=${sider.bg}`);

  // 经销商排行：实时聚合默认
  await page.goto('http://localhost:5173/kox_df/operation-analysis/dealer-ranking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  ok('dealer mode toggle', await page.isVisible('text=实时聚合') && await page.isVisible('text=考核快照'));
  ok('dealer live default', await page.isVisible('text=2026-10'));
  const rows1 = await page.$$eval('.ant-table-tbody tr', (els) => els.length);
  ok('dealer table rows', rows1 >= 5, `rows=${rows1}`);
  // 切考核快照
  await page.click('.ant-radio-button-wrapper:has-text("考核快照")');
  await page.waitForTimeout(2000);
  ok('snapshot month 2026-09', await page.isVisible('text=2026-09'));
  // 大区筛选 + 导出按钮仍在
  ok('dealer export btn', await page.isVisible('text=导出数据'));

  ok('zero pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('DEALER SMOKE DONE');
})().catch((e) => { console.error('smoke error:', e); process.exitCode = 1; });