// 专业号平台自动登录（账密 PRO_ACCOUNT/PRO_PASSWORD 来自 tools/spark/.env）
// 用法:
//   node login-pro.cjs                （有头自动填充账密；出现验证码/滑块时人工完成，脚本轮询登录态）
//   HEADLESS=1 node login-pro.cjs     （无头尝试，纯账密直登时可用）
//   TAG=mytag node login-pro.cjs      （state 存 state/auth-mytag.json，默认 auth-pro.json）
//   PUSH=1 node login-pro.cjs         （登录成功后自动推送 storageState 到后端 brand 6）
// 登录成功后可用 push-pro-state.cjs 单独推送
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const ACCOUNT = process.env.PRO_ACCOUNT || env.PRO_ACCOUNT;
const PASSWORD = process.env.PRO_PASSWORD || env.PRO_PASSWORD;
if (!ACCOUNT || !PASSWORD) {
  console.error('缺少 PRO_ACCOUNT/PRO_PASSWORD（tools/spark/.env）');
  process.exit(1);
}
const TAG = (process.env.TAG || 'pro').trim();
const STATE_FILE = path.join(__dirname, 'state', `auth-${TAG}.json`);
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

(async () => {
  const headless = process.env.HEADLESS === '1';
  const browser = await chromium.launch({
    headless,
    args: process.env.NO_PROXY === '1' ? ['--no-proxy-server'] : [],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  console.log('[pro] 打开 pro.xiaohongshu.com ...');
  await page.goto('https://pro.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);

  // 已登录则直接保存
  const loggedIn = async () => {
    const url = page.url();
    if (/enterprise|dashboard|data/.test(url) && !/login/.test(url)) return true;
    const cookies = await ctx.cookies('https://pro.xiaohongshu.com');
    return cookies.some((c) => /customer-sso-sid|access-token/.test(c.name));
  };

  if (!(await loggedIn())) {
    console.log('[pro] 尝试自动填充账密 ...');
    try {
      // 账密登录 tab（页面可能默认扫码 tab）
      const pwdTab = page.locator('text=/账密|密码登录|账号登录/').first();
      if (await pwdTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pwdTab.click();
        await sleep(800);
      }
      const user = page.locator('input[type="text"], input[placeholder*="邮箱"], input[placeholder*="账号"], input[placeholder*="手机"]').first();
      await user.waitFor({ state: 'visible', timeout: 10000 });
      await user.fill(ACCOUNT);
      const pass = page.locator('input[type="password"]').first();
      await pass.fill(PASSWORD);
      await sleep(400);
      const btn = page.locator('button:has-text("登 录"), button:has-text("登录"), [class*="login"] button').first();
      await btn.click();
      console.log('[pro] 已提交登录，若出现验证码请在窗口完成（最长等 5 分钟）...');
    } catch (e) {
      console.log(`[pro] 自动填充失败（${String(e).slice(0, 80)}），请在窗口人工登录`);
    }
    let ok = false;
    for (let i = 0; i < 150; i++) {
      await sleep(2000);
      if (await loggedIn()) { ok = true; break; }
      if (i > 0 && i % 15 === 0) console.log('[pro] 等待登录中...');
    }
    if (!ok) {
      console.log('[pro] 5 分钟内未检测到登录态，退出');
      await browser.close();
      process.exit(1);
    }
  }
  await sleep(2000);
  fs.writeFileSync(STATE_FILE, JSON.stringify(await ctx.storageState()), 'utf8');
  console.log(`[pro] 登录成功，state 已保存: ${STATE_FILE}`);
  await browser.close();

  if (process.env.PUSH === '1') {
    const API = process.env.API || 'http://localhost:3000/api/agency-api';
    const BRAND = process.env.BRAND || '6';
    const loginRes = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.ADMIN_USER || '18600104701', password: sha1(process.env.ADMIN_PASS || 'yoyo0508'), main_company_id: BRAND }),
    });
    const lj = await loginRes.json();
    if (lj.code !== 100) { console.error('admin login fail'); process.exit(1); }
    const res = await fetch(`${API}/pro/storage-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: lj.data.token },
      body: JSON.stringify({ brandId: BRAND, storageState: fs.readFileSync(STATE_FILE, 'utf8') }),
    });
    console.log('push result:', JSON.stringify(await res.json()));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
