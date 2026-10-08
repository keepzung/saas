#!/usr/bin/env node
// 来鼓后台：抓 dashboard 会话 token（authorization 头）+ API 页 app_key/app_secret
// 前置：state/laigu-auth-laigu-tesla.json 为有效登录态（先跑 laigu-login-token.cjs）
// 输出: state/laigu-token-latest.txt（会话token）、state/laigu-appkey-secret.json
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state');
const STATE = path.join(OUT, 'laigu-auth-laigu-tesla.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const authSeen = new Map();
  const reqLog = [];
  page.on('request', (req) => {
    const h = req.headers();
    if (h.authorization && /meiqia\.cn|laigu\.com/.test(req.url())) {
      authSeen.set(h.authorization, (authSeen.get(h.authorization) || 0) + 1);
    }
    if (req.method() !== 'OPTIONS' && !/\.(js|css|png|svg|woff|ico|map)/.test(req.url())) {
      reqLog.push(req.method() + ' ' + req.url().slice(0, 130) + ' | headers: ' + Object.keys(h).filter((k) => /auth|token/i.test(k)).join(',') + ' | ' + (h.authorization || '').slice(0, 24));
    }
  });

  console.log('[1] 打开 dashboard ...');
  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(8000);
  if (/login|passport/i.test(page.url())) {
    console.error('登录态失效，请先跑 laigu-login-token.cjs 重新登录');
    await browser.close();
    process.exit(1);
  }
  let token = '';
  for (let i = 0; i < 6 && !token; i++) {
    await sleep(3000);
    for (const [k, n] of authSeen) if (n >= 2) { token = k; break; }
    if (!token && authSeen.size) token = [...authSeen.keys()][0];
  }
  console.log('[token] 捕获', token ? `长度${token.length}` : '失败', '| 候选', authSeen.size, '个');
  console.log('[requests]');
  reqLog.slice(0, 25).forEach((l) => console.log('  ', l));
  if (!token) {
    await browser.close();
    process.exit(1);
  }

  // 打开 API 页（app_key/app_secret）
  console.log('[2] 找 API 页 ...');
  const candidates = ['API', 'api'];
  let onApi = false;
  for (const t of candidates) {
    const el = page.locator(`text=${t}`).first();
    if (await el.count().catch(() => 0)) {
      await el.click({ timeout: 5000 }).catch(() => {});
      await sleep(5000);
      if (/api/i.test(page.url())) { onApi = true; console.log('[nav] ->', page.url().slice(0, 120)); break; }
    }
  }
  if (!onApi) {
    for (const u of ['https://pro.laigu.com/api', 'https://pro.laigu.com/openapi', 'https://pro.laigu.com/dashboard/api', 'https://pro.laigu.com/api-key', 'https://pro.laigu.com/setting/api']) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(5000);
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 2000)).catch(() => '');
      if (/app_secret|app_key/i.test(txt)) { onApi = true; console.log('[found]', u); break; }
    }
  }
  let appKey = '', appSecret = '';
  if (onApi) {
    appKey = (await page.evaluate(() => document.body.innerText.match(/app_key\s*\n?\s*([^\n]+)/i)?.[1] ?? '')).trim();
    // 点 app_secret 行的眼睛/图标按钮显示明文
    const eye = page.locator('svg, i, [class*=eye], [class*=visible], [class*=icon]').locator('visible=true');
    const n = await eye.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 25); i++) {
      await eye.nth(i).click({ timeout: 1500, force: true }).catch(() => {});
      await sleep(600);
      const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
      const m = txt.match(/app_secret\s*\n?\s*([^\n]+)/i);
      if (m && m[1] && !/\*/.test(m[1]) && m[1].length >= 16) { appSecret = m[1].trim(); break; }
    }
    const full = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (!appSecret) appSecret = (full.match(/app_secret\s*\n?\s*([^\n]+)/i)?.[1] ?? '').trim();
    console.log('[api页] app_key:', appKey, '| app_secret:', appSecret ? `${appSecret.slice(0, 4)}***(len ${appSecret.length})` : '未显示');
    await page.screenshot({ path: path.join(OUT, 'laigu-api-now.png') });
  }

  fs.writeFileSync(path.join(OUT, 'laigu-token-latest.txt'), token, 'utf8');
  fs.writeFileSync(path.join(OUT, 'laigu-appkey-secret.json'), JSON.stringify({ appKey, appSecret, capturedAt: new Date().toISOString() }, null, 1), 'utf8');
  console.log('[saved] laigu-token-latest.txt + laigu-appkey-secret.json');
  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
