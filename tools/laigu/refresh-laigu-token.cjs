// 来鼓 token 一键刷新：管理员账密登录 pro.laigu.com → 评论页抓 authorization → 输出新 token
// 用法: node refresh-laigu-token.cjs   （HEADLESS=0 人工辅助验证码）
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, 'laigu-state-laigu-tesla.json');
const USER = process.env.LAIGU_USER || '13348900747';
const PASS = process.env.LAIGU_PASS || '1510Ywys';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1600, height: 900 },
  });
  const page = await ctx.newPage();

  let authHeader = null;
  page.on('request', (req) => {
    if (/comment\/list|redbook/.test(req.url())) {
      const h = req.headers();
      if (h.authorization && /^[0-9a-f]{32,80}$/.test(h.authorization)) authHeader = h.authorization;
    }
  });

  console.log('[1] 打开 pro.laigu.com ...');
  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  // 登录检测：URL 含 login 或页面有密码框
  const needLogin = await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => false);
  if (needLogin) {
    console.log('[login] 请在本窗口手动完成登录（账号/密码/验证码，最长等 6 分钟）...');
  }
  // 等待登录完成（人工或自动），最长 6 分钟
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    const onLogin = page.url().includes('/login');
    const hasPw = await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => true);
    if (!onLogin && !hasPw) break;
    if (i % 10 === 9) console.log('[login] 等待登录中...');
  }
  console.log('[2] 当前 URL:', page.url().slice(0, 90));

  // 打开评论页触发 comment/list（带鉴权头）
  console.log('[3] 打开评论页抓 token ...');
  await page.goto('https://pro.laigu.com/comment', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(10000);
  // 若页面有查询按钮，点一次触发请求
  const qbtn = page.locator('button:has-text("查询"), button:has-text("搜 索")').first();
  if (await qbtn.count()) await qbtn.click({ timeout: 3000 }).catch(() => {});
  await sleep(6000);

  if (!authHeader) {
    console.log('[!] 未抓到鉴权头（页面可能未发评论请求），输出页面状态排查');
    await page.screenshot({ path: path.join(OUT, 'refresh-debug.png'), fullPage: false });
    await browser.close();
    process.exit(1);
  }
  const isNew = authHeader !== '965a57ee9299dd88dd45320c31e7a05508f31a864e98d50c17e5b020f9ec';
  console.log(`[4] token: ${authHeader.slice(0, 20)}...（${isNew ? '新 token' : '与旧 token 相同'}）`);
  fs.writeFileSync(path.join(OUT, 'laigu-token-latest.txt'), authHeader, 'utf8');
  fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');
  console.log('[4] state 已更新');
  await browser.close();
  console.log(`TOKEN:${authHeader}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
