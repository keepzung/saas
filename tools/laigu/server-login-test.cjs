#!/usr/bin/env node
// 服务器侧验证：能否无头登录来鼓后台并取到 token（读取同目录 ../backend/.env 的 LAIGU_LOGIN_*）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const env = fs.readFileSync(process.env.ENV_PATH || path.join(__dirname, '..', 'backend', '.env'), 'utf8');
const v = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].replace(/^"|"$/g, '').trim() : '';
};
const USER = v('LAIGU_LOGIN_USER');
const PASS = v('LAIGU_LOGIN_PASSWORD');

(async () => {
  if (!USER || !PASS) { console.error('缺少 LAIGU_LOGIN_USER/LAIGU_LOGIN_PASSWORD'); process.exit(1); }
  let exe;
  try { exe = chromium.executablePath(); if (exe && !fs.existsSync(exe)) exe = undefined; } catch { exe = undefined; }
  if (!exe) {
    const base = '/home/deploy/.cache/ms-playwright';
    for (const d of fs.existsSync(base) ? fs.readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse() : []) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const fp = path.join(base, d, sub);
        if (fs.existsSync(fp)) { exe = fp; break; }
      }
      if (exe) break;
    }
  }
  const browser = await chromium.launch({ headless: true, executablePath: exe || undefined, args: ['--no-proxy-server'] });
  const page = await (await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN' })).newPage();
  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('goto err:', e.message.split('\n')[0]));
  await page.waitForTimeout(5000);
  if (/login/i.test(page.url()) || (await page.locator('input[type="password"]').count())) {
    await page.locator('input[type="text"],input[placeholder*="手机"],input[placeholder*="账号"]').first().fill(USER, { timeout: 15000 }).catch(() => {});
    await page.locator('input[type="password"]').first().fill(PASS, { timeout: 15000 }).catch(() => {});
    const agree = page.locator('text=同意').first();
    if (await agree.count()) {
      const b = await agree.boundingBox({ timeout: 2000 }).catch(() => null);
      if (b) await page.mouse.click(b.x - 18, b.y + b.height / 2).catch(() => {});
    }
    const btn = page.locator('button:has-text("登")').first();
    if (await btn.count()) await btn.click({ timeout: 8000 }).catch(() => {});
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);
  }
  const token = await page.evaluate(() => localStorage.getItem('token') || '').catch(() => '');
  console.log(/login/i.test(page.url()) ? 'FAIL still-login ' + page.url().slice(0, 80) : 'PASS url=' + page.url().slice(0, 60) + ' token_len=' + token.length);
  await browser.close();
})().catch((e) => { console.error('ERR', e.message.split('\n')[0]); process.exit(1); });
