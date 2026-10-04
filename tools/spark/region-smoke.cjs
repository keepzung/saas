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
  await page.goto('http://localhost:5173/kox_df/operation-analysis/region-ranking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const data = await page.evaluate(() => {
    const dataRows = (table) =>
      [...table.querySelectorAll('.ant-table-tbody tr')]
        .map((r) => r.innerText.replace(/\t/g, '|'))
        .filter((t) => t.replace(/[|\s-]/g, '').length > 0);
    const t = document.querySelectorAll('.ant-table');
    return { t1: dataRows(t[0]), t2: dataRows(t[1]) };
  });
  ok('t1 national first', data.t1[0]?.startsWith('-|全国'), data.t1[0]?.slice(0, 60));
  const natFee = data.t1[0]?.split('|').pop();
  ok('t1 national real fee', /^¥[\d,]+\.\d\d$/.test(natFee ?? ''), natFee);
  ok('t1 region fee is —', data.t1[1]?.endsWith('—'), data.t1[1]?.slice(-40));
  ok('t2 single national row', data.t2.length === 1 && data.t2[0].includes('全国'), `rows=${data.t2.length}`);
  ok('t2 fee matches t1', (natFee ?? '').includes((data.t2[0] ?? '').split('|')[2] ?? '###'), data.t2[0]?.slice(0, 80));
  ok('t2 has dash for reply_rate/account_cnt', data.t2[0]?.split('|').filter((x) => x === '—').length >= 2, data.t2[0]);
  ok('zero pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('REGION SMOKE v2 DONE');
})().catch((e) => { console.error('smoke error:', e); process.exitCode = 1; });