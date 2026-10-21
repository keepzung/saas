// 本机手动登录抓 cookie：node manual-login.cjs <brandId> <mcc|partner>
// 弹出真实 Chrome 窗口 → 用户手动登录（含滑块/验证码）→ 检测到离开登录页自动保存
// 产物：%TEMP%\mkt-login\state-b{brandId}-{platform}.cookie.txt（cookie 串）+ .json（storageState）
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createRequire } = require('module');
const repoRequire = createRequire(path.join(__dirname, '..', 'backend', 'noop.js'));
const { chromium } = repoRequire('playwright-core');

const brandId = process.argv[2] || '7';
const platform = process.argv[3] || 'mcc';
const url = platform === 'partner'
  ? 'https://partner.xiaohongshu.com/partner/watch-dashboard'
  : 'https://mcc.xiaohongshu.com/login';
const outDir = path.join(os.tmpdir(), 'mkt-login');
fs.mkdirSync(outDir, { recursive: true });
const profile = path.join(outDir, `profile-b${brandId}-${platform}`);
const stateFile = path.join(outDir, `state-b${brandId}-${platform}.json`);
const cookieFile = path.join(outDir, `state-b${brandId}-${platform}.cookie.txt`);

(async () => {
  const exe = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--start-maximized'] });
  const ctx = await browser.newContext({ viewport: null, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  console.log(`[b${brandId}-${platform}] 浏览器窗口已弹出，请在窗口内完成登录（验证码/滑块手动处理）...`);
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60_000) {
    await new Promise((r) => setTimeout(r, 3000));
    const u = page.url();
    if (!/login|passport|signin/i.test(u)) {
      await new Promise((r) => setTimeout(r, 5000));
      try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch {}
      await new Promise((r) => setTimeout(r, 2000));
      if (/login|passport|signin/i.test(page.url())) { console.log('回到登录页，继续等待...'); continue; }
      const state = await ctx.storageState();
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      const cookies = state.cookies
        .filter((c) => /xiaohongshu\.com$/.test(c.domain))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      fs.writeFileSync(cookieFile, cookies);
      console.log(`[b${brandId}-${platform}] 登录成功！cookie 已保存 (len=${cookies.length}): ${cookieFile}`);
      await new Promise((r) => setTimeout(r, 1500));
      await browser.close().catch(() => {});
      process.exit(0);
    }
  }
  console.error('[b' + brandId + '] 10 分钟未检测到登录成功，退出');
  await browser.close().catch(() => {});
  process.exit(1);
})().catch((e) => { console.error(String(e)); process.exit(1); });
