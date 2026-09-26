// 蒲公英 partner 平台登录探测：用特斯拉账密登录 watch-dashboard，截图+记录可见数据
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ENV = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const USER = ENV.SPARK_ACCOUNT_TESLA;
const PASS = ENV.SPARK_PASSWORD_TESLA;
const LOGIN_URL =
  'https://partner.xiaohongshu.com/login?service=https%3A%2F%2Fpartner.xiaohongshu.com%2Fpartner%2Fwatch-dashboard';
const OUT = path.join(__dirname, 'state');

(async () => {
  const headless = process.env.HEADLESS !== '0';
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const apiHits = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (/partner\.xiaohongshu\.com\/api|edith|dashboard/i.test(url)) {
      let snippet = '';
      try {
        if (/json/i.test(res.headers()['content-type'] ?? '')) {
          snippet = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
        }
      } catch {}
      apiHits.push(`${res.status()} ${url.slice(0, 110)} ${snippet}`);
    }
  });

  console.log('[*] 打开登录页 ...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('nav:', e.message.split('\n')[0]));
  await page.waitForTimeout(4000);
  console.log('[*] 当前 URL:', page.url());
  console.log('[*] 标题:', await page.title());

  // 若已直接进入 dashboard（免登录）则跳过登录步骤
  if (!/login/i.test(page.url())) {
    console.log('[*] 已是登录后状态');
  } else {
    const userInput = page
      .locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"], input[placeholder*="手机"]')
      .locator('visible=true')
      .first();
    const passInput = page.locator('input[type="password"]').locator('visible=true').first();
    const hasUser = (await userInput.count()) > 0;
    const hasPass = (await passInput.count()) > 0;
    console.log(`[*] 输入框: 账号=${hasUser} 密码=${hasPass}`);
    if (hasUser && hasPass) {
      await userInput.fill(USER);
      await passInput.fill(PASS);
      await page.waitForTimeout(500);
      // 协议勾选（如有）
      const agree = page.locator('text=同意').first();
      if (await agree.count()) {
        try {
          const box = await agree.boundingBox({ timeout: 2000 });
          if (box) {
            await page.mouse.click(box.x - 18, box.y + box.height / 2);
            console.log('[*] 已勾选协议(偏移点击)');
          }
        } catch {}
      }
      await page.screenshot({ path: path.join(OUT, 'partner-02-filled.png') });
      const btn = page
        .locator('button:has-text("登录"), button:has-text("登 录"), [class*=login][role=button]')
        .first();
      if (await btn.count()) {
        console.log('[*] 点击登录 ...');
        await btn.click().catch((e) => console.log('click err:', e.message.split('\n')[0]));
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(6000);
    } else {
      console.log('[!] 未找到登录输入框——可能需要扫码或验证，请人工处理');
    }
  }

  // 有头模式给人工 240s 完成滑块/验证码
  if (!headless) {
    console.log('[*] 如需人工验证请在窗口完成，等待跳转 dashboard（最多240s）...');
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if (!/login|passport|captcha/i.test(page.url())) break;
      await page.waitForTimeout(3000);
    }
  } else {
    await page.waitForTimeout(8000);
  }

  await page.waitForTimeout(5000);
  console.log('[*] 最终 URL:', page.url());
  await page.screenshot({ path: path.join(OUT, 'partner-03-final.png'), fullPage: false });
  const bodyText = (await page.evaluate(() => document.body.innerText).catch(() => ''))
    .replace(/\s+/g, ' ')
    .slice(0, 1200);
  console.log('[*] 页面文本:', bodyText);
  console.log('[*] API 命中:');
  for (const h of apiHits.slice(0, 20)) console.log('   ', h);

  await ctx.storageState({ path: path.join(OUT, 'partner-tesla-state.json') });
  console.log('[*] state 已存 partner-tesla-state.json');
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
