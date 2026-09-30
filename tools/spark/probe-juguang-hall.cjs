// 实验1：hall 账密直接登录聚光平台（预期被拒，实测确认当前状态）
// 用法: node probe-juguang-hall.cjs   （HEADLESS=0 有头观察）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const ACCOUNT = process.env.SPARK_ACCOUNT_TESLA || env.SPARK_ACCOUNT_TESLA;
const PASSWORD = process.env.SPARK_PASSWORD_TESLA || env.SPARK_PASSWORD_TESLA;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const headless = process.env.HEADLESS !== '0';
  const browser = await chromium.launch({ headless, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  console.log('[1] 打开聚光登录页 ...');
  await page.goto('https://ad.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);
  console.log('[1] 当前 URL:', page.url().slice(0, 90));

  // 账号登录 tab
  try {
    const tab = page.locator('text=/账号登录/').first();
    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); await sleep(600); }
    const user = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').first();
    await user.waitFor({ state: 'visible', timeout: 10000 });
    await user.fill(ACCOUNT);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await sleep(300);
    await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
    console.log('[2] 已提交登录，等待响应 ...');
  } catch (e) {
    console.log('[2] 自动填充失败:', String(e).slice(0, 80));
  }
  await sleep(5000);
  // 检测错误提示
  const errText = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="error"], [class*="tip"], [class*="Toast"], [class*="message"]');
    const texts = [];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t && t.length < 120 && /不支持|错误|失败|请登录/.test(t)) texts.push(t);
    }
    return texts.join(' | ');
  });
  console.log('[3] 页面提示:', errText || '(无错误提示)');
  console.log('[3] 当前 URL:', page.url().slice(0, 90));
  // 登录成功判定
  const cookies = await ctx.cookies('https://ad.xiaohongshu.com');
  const hasSession = cookies.some((c) => /session|token|access/i.test(c.name) && c.value.length > 20);
  console.log('[3] 聚光会话 cookie:', hasSession ? '有' : '无');
  await page.screenshot({ path: path.join(__dirname, 'state', 'juguang-hall-login-result.png'), fullPage: false });
  console.log('[3] 截图: state/juguang-hall-login-result.png');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
