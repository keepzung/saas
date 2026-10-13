#!/usr/bin/env node
// MCC 有头登录：自动填凭据，人工完成滑块/验证码，成功后把 xiaohongshu.com cookie 写到 --out 文件
// 用法: node mcc-login-headed.cjs --envkey DF --out ../state/mcc-cookie-b7.txt
//   --envkey 读取 backend/.env 的 SPARK_ACCOUNT_<KEY>/SPARK_PASSWORD_<KEY>
//   也可直接 --account <邮箱> --password <密码>
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }

// 读取 .env（优先 tools/spark/.env，其次 backend/.env）
for (const p of [path.join(__dirname, '.env'), path.join(ROOT, 'backend', '.env')]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
}

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const envKey = arg('envkey');
const varName = (base) => (envKey && envKey.toUpperCase() !== 'BASE' ? `${base}_${envKey.toUpperCase()}` : base);
const ACCOUNT = arg('account') || process.env[varName('SPARK_ACCOUNT')] || '';
const PASSWORD = arg('password') || process.env[varName('SPARK_PASSWORD')] || '';
const OUT = arg('out') || path.join(__dirname, 'state', `mcc-cookie-${envKey || 'x'}.txt`);

if (!ACCOUNT || !PASSWORD) {
  console.error('缺少凭据：--account/--password 或 --envkey（backend/.env 的 SPARK_ACCOUNT_*/SPARK_PASSWORD_*）');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CHROME_BIN = process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROME_BIN,
    args: ['--no-proxy-server', '--no-sandbox', '--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: null });
  const page = await ctx.newPage();
  console.log('[1] 打开 MCC 登录页，自动填写凭据…');
  await page.goto('https://mcc.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  await page.locator('input[placeholder="邮箱"]').first().fill(ACCOUNT, { timeout: 20000 }).catch(() => {});
  await page.locator('input[placeholder="密码"]').first().fill(PASSWORD, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (!cb.checked) cb.click(); });
  }).catch(() => {});
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').replace(/\s+/g, '') === '登录' && /beer-login-btn/.test(b.className));
    if (el) el.click();
  }).catch(() => {});
  await page.locator('input[placeholder="密码"]').first().press('Enter').catch(() => {});
  console.log('[2] 已提交登录。若出现滑块/验证码，请在浏览器窗口中手动完成（最多等待 3 分钟）…');

  let cookieStr = '';
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (!/login|passport/i.test(page.url())) {
      const stateJson = await ctx.storageState();
      cookieStr = (stateJson.cookies ?? [])
        .filter((c) => /xiaohongshu\.com$/.test(c.domain))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      break;
    }
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const errHit = bodyText.match(/密码错误|账号或密码|账号不存在|已被冻结|没有权限|权限不足/);
    if (errHit) {
      console.error(`[失败] 登录被拒: ${errHit[0]}`);
      await browser.close().catch(() => {});
      process.exit(2);
    }
    if (/拖动滑块|滑块验证|安全验证/.test(bodyText) && i % 5 === 0) {
      console.log(`  …等待人工完成滑块验证 (${Math.round((i + 1) * 3 / 60 * 10) / 10} 分钟)`);
    }
  }
  await browser.close().catch(() => {});
  if (!cookieStr) {
    console.error('[失败] 3 分钟内未完成登录，未捕获 cookie');
    process.exit(3);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, cookieStr, 'utf8');
  console.log(`[成功] cookie 已捕获（${cookieStr.length} 字符）→ ${OUT}`);
})();
