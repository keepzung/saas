#!/usr/bin/env node
// 来鼓后台登录 + 开放平台 token 抓取
// 用法: node laigu-login-token.cjs   （HEADLESS=0 人工辅助）
// 输出: tools/laigu/state/laigu-token-latest.txt（新 token）；openapi 页文本/截图；全部 API 响应
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('../spark/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, 'state');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, 'laigu-auth-laigu-tesla.json');

// 凭据：tools/laigu/.env 的 LAIGU_USER / LAIGU_PASS（不入库）
const envFile = path.join(HERE, '.env');
const envMap = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (m) envMap[m[1]] = m[2];
  }
}
const USER = process.env.LAIGU_USER || envMap.LAIGU_USER || '';
const PASS = process.env.LAIGU_PASS || envMap.LAIGU_PASS || '';
if (!USER || !PASS) { console.error('缺少 LAIGU_USER/LAIGU_PASS（tools/laigu/.env）'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const apis = [];

(async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1680, height: 1000 },
  });
  const page = await ctx.newPage();
  page.on('response', async (res) => {
    const u = res.url();
    if (res.request().method() === 'OPTIONS') return;
    if (/api|open|gateway|token|clue|comment|lead/i.test(u) && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      let body = '';
      try { body = (await res.text()).slice(0, 3000); } catch {}
      apis.push({ u: u.slice(0, 180), post: res.request().postData()?.slice(0, 400) ?? '', res: body });
    }
  });

  console.log('[1] 打开来鼓后台 ...');
  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(6000);
  console.log('[landing]', page.url().slice(0, 120));

  if (/login|passport|sso/i.test(page.url()) || (await page.locator('input[type="password"]').count().catch(() => 0))) {
    console.log('[2] 登录 ...');
    const u = page.locator('input[type="text"], input[placeholder*="手机"], input[placeholder*="账号"]').locator('visible=true').first();
    const pw = page.locator('input[type="password"]').locator('visible=true').first();
    await u.fill(USER, { timeout: 15000 }).catch((e) => console.log('fill user fail:', e.message.split('\n')[0]));
    await pw.fill(PASS, { timeout: 15000 }).catch((e) => console.log('fill pass fail:', e.message.split('\n')[0]));
    const agree = page.locator('text=同意').first();
    if (await agree.count().catch(() => 0)) {
      const box = await agree.boundingBox({ timeout: 2000 }).catch(() => null);
      if (box) await page.mouse.click(box.x - 18, box.y + box.height / 2).catch(() => {});
    }
    const btn = page.locator('button:has-text("登"), button:has-text("登录")').first();
    if (await btn.count().catch(() => 0)) await btn.click({ timeout: 8000 }).catch(() => {});
    else await page.keyboard.press('Enter');
    await sleep(8000);
    // 滑块/验证码兜底：等待 URL 离开登录页（最多 5 分钟，HEADLESS=0 时可人工）
    for (let i = 0; i < 60 && /login|passport|sso/i.test(page.url()); i++) {
      await sleep(5000);
      if (i === 6) console.log('[!] 仍在登录页，如出现滑块请在浏览器中手动完成（HEADLESS=0）...');
    }
  } else {
    console.log('[2] 已有会话，免登录');
  }
  console.log('[3] 登录后URL:', page.url().slice(0, 120));
  fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');

  // 找开放平台/凭证入口
  console.log('[4] 查找开放平台/凭证入口 ...');
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a, [role=menuitem], .menu li, li, span, div')]
      .map((n) => ({ t: (n.innerText || '').trim().slice(0, 20), h: n.href || '' }))
      .filter((x) => x.t && /开放|平台|凭证|appkey|app_key|secret|token|api/i.test(x.t))
      .slice(0, 20),
  );
  console.log('候选入口:', JSON.stringify(links));
  let opened = false;
  for (const l of links) {
    const el = page.locator(`text=${l.t}`).first();
    if (await el.count().catch(() => 0)) {
      const before = page.url();
      await el.click({ timeout: 5000 }).catch(() => {});
      await sleep(5000);
      if (page.url() !== before) { opened = true; console.log('[nav]', l.t, '->', page.url().slice(0, 120)); break; }
    }
  }
  if (!opened) {
    // 常见路径兜底
    for (const u of ['https://pro.laigu.com/dashboard/open', 'https://pro.laigu.com/open', 'https://pro.laigu.com/dashboard/openapi']) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(4000);
      console.log('[try]', u, '->', page.url().slice(0, 120));
    }
  }

  // 抓页面上的 token/appkey/secret 形态字符串
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  fs.writeFileSync(path.join(OUT, 'laigu-openapi-page.txt'), page.url() + '\n' + text, 'utf8');
  await page.screenshot({ path: path.join(OUT, 'laigu-openapi-now.png') });
  const tokens = (text.match(/[0-9a-f]{32,64}/gi) || []).slice(0, 10);
  console.log('[token-like strings]', JSON.stringify(tokens));
  const kv = {};
  for (const key of ['appKey', 'app_key', 'AppKey', 'secret', 'Secret', 'token', 'Token', 'agentId']) {
    const m = text.match(new RegExp(key + `[^A-Za-z0-9]{0,6}([A-Za-z0-9]{16,64})`));
    if (m) kv[key] = m[1];
  }
  console.log('[kv]', JSON.stringify(kv));
  fs.writeFileSync(path.join(OUT, 'laigu-api-capture.json'), JSON.stringify(apis, null, 1), 'utf8');
  if (tokens.length || Object.keys(kv).length) {
    fs.writeFileSync(path.join(OUT, 'laigu-token-latest.txt'), (kv.token || kv.appKey || tokens[0] || ''), 'utf8');
    console.log('[saved] state/laigu-token-latest.txt');
  }
  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
