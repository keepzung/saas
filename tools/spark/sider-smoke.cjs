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

  const siderInfo = async () =>
    page.evaluate(() => {
      const sider = document.querySelector('.sider');
      if (!sider) return { count: 0, text: '', bg: '' };
      const items = sider.querySelectorAll('.ant-menu-submenu, .ant-menu-item');
      return { count: items.length, text: (sider.innerText || '').replace(/\n/g, '|'), bg: getComputedStyle(sider).backgroundColor };
    });

  // 1) 工厂 Tab：侧栏有工厂菜单
  await page.goto('http://localhost:5173/content-pro/workbench', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const f = await siderInfo();
  ok('factory sider items', f.count >= 9, `count=${f.count}`);
  ok('factory sider groups', f.text.includes('工作台') && f.text.includes('资料&策略') && f.text.includes('内容生产'), f.text.slice(0, 90));
  ok('factory sider new group', f.text.includes('内容管理') && f.text.includes('内容包Pro') && f.text.includes('内容审核') && f.text.includes('领用记录'));
  ok('factory sider dark', f.bg === 'rgb(15, 23, 42)', `bg=${f.bg}`);

  // 2) KOX Tab：不含 内容工厂Pro 分类
  await page.goto('http://localhost:5173/kox_df/operation-analysis/overview', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const k = await siderInfo();
  ok('kox sider items', k.count > 10, `count=${k.count}`);
  ok('kox no factory cat', !k.text.includes('内容工厂Pro'), k.text.slice(0, 100));
  ok('kox no task group', !k.text.includes('内容创作任务'));

  // 3) 任务 Tab：只有 内容创作任务 组
  await page.goto('http://localhost:5173/kox_task/content-task/task-list', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const t = await siderInfo();
  ok('task sider has group', t.text.includes('任务列表') || t.text.includes('内容创作任务'), t.text.slice(0, 90));
  ok('task sider clean', !t.text.includes('内容工厂Pro') && !t.text.includes('KOX运营管理') && !t.text.includes('项目管理'), `text=${t.text.slice(0, 60)}`);

  // 4) 格力 brand8 工厂 Tab
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入账号"]', '18600104701');
  await page.fill('input[placeholder="请输入密码"]', 'yoyo0508');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2200);
  const card8 = page.locator('.company-card', { hasText: '格力' }).first();
  await card8.click(); await page.waitForTimeout(500);
  await page.click('.action-confirm'); await page.waitForTimeout(2000);
  await page.goto('http://localhost:5173/content-pro/workbench', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const g8 = await siderInfo();
  ok('gree factory sider', g8.count >= 9 && g8.text.includes('内容生产'), `count=${g8.count}`);

  // 5) brand1 回归
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入账号"]', '18600104701');
  await page.fill('input[placeholder="请输入密码"]', 'yoyo0508');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2200);
  const card1 = page.locator('.company-card', { hasText: 'Marketine' }).first();
  await card1.click(); await page.waitForTimeout(500);
  await page.click('.action-confirm'); await page.waitForTimeout(2000);
  await page.goto('http://localhost:5173/welcome', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok('brand1 no tabbar', !(await page.$('.workspace-tabbar')));
  const b1 = await siderInfo();
  ok('brand1 sider normal', b1.count > 10 && !b1.text.includes('热门内容分析'), `count=${b1.count}`);

  ok('zero pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('SIDER SMOKE DONE');
})().catch((e) => { console.error('probe error:', e); process.exitCode = 1; });