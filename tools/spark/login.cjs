// 星火平台登录 + 登录页结构探测
// 用法: node login.cjs            (headless)
//       HEADLESS=0 node login.cjs (有头，遇到滑块时人工拖动，脚本等待登录完成)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 手动读 .env（不依赖 dotenv 包）
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const STATE_DIR = path.join(__dirname, 'state');
const STATE_FILE = path.join(STATE_DIR, 'auth.json');
fs.mkdirSync(STATE_DIR, { recursive: true });

const dumpPage = async (page, label) => {
  console.log(`\n===== [${label}] URL: ${page.url()}`);
  console.log(`TITLE: ${await page.title()}`);
  const info = await page.evaluate(() => {
    const texts = (sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          placeholder: el.getAttribute('placeholder') || '',
          href: el.getAttribute('href') || '',
          cls: (el.className && String(el.className).slice?.(0, 80)) || '',
        }))
        .filter((x) => x.text || x.placeholder || x.href);
    return {
      inputs: texts('input'),
      buttons: texts('button, [role=button], .btn, a[class*=login]'),
      iframes: [...document.querySelectorAll('iframe')].map((f) => ({
        src: f.src,
        id: f.id,
        cls: String(f.className || '').slice(0, 80),
      })),
      tabs: texts('[class*=tab], [class*=Tab]').slice(0, 15),
      bodySnippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
    };
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 4000));
};

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

  console.log('[*] opening mcc.xiaohongshu.com ...');
  await page.goto('https://mcc.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(STATE_DIR, '01-login-page.png'), fullPage: false });
  await dumpPage(page, 'login-page');

  // 确保在「账号登录」tab
  const pwdTab = page.locator('text=账号登录').first();
  if (await pwdTab.count()) {
    console.log('[*] clicking tab: 账号登录');
    await pwdTab.click().catch(() => {});
    await page.waitForTimeout(1200);
  }

  // 找输入框（可见的邮箱 + 密码）
  const userInput = page
    .locator('input[placeholder*="邮箱"], input[placeholder*="手机号"], input[placeholder*="账号"]')
    .locator('visible=true')
    .first();
  const passInput = page.locator('input[type="password"]').locator('visible=true').first();

  const hasUser = await userInput.count();
  const hasPass = await passInput.count();
  console.log(`[*] user input found: ${!!hasUser}, password input found: ${!!hasPass}`);

  const page2 = page;
  page2.on('response', async (res) => {
    if (/login|session|passport|api/i.test(res.url()) && res.request().method() === 'POST') {
      const txt = (await res.text().catch(() => '')).slice(0, 300);
      console.log(`[net] ${res.status()} POST ${res.url().slice(0, 120)} -> ${txt}`);
    }
  });

  if (hasUser && hasPass) {
    await userInput.fill(env.SPARK_ACCOUNT);
    await passInput.fill(env.SPARK_PASSWORD);
    await page.waitForTimeout(500);

    // 勾选协议：点文本左侧的圆形勾选框（坐标偏移）
    const agree = page.locator('text=我已阅读并同意').first();
    if (await agree.count()) {
      try {
        const box = await agree.boundingBox({ timeout: 5000 });
        if (box) {
          await page.mouse.click(box.x - 20, box.y + box.height / 2);
          console.log('[*] agreement checkbox clicked (offset)');
        }
      } catch (e) {
        console.log('[*] agreement offset click skip:', e.message.split('\n')[0]);
      }
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(STATE_DIR, '02-filled.png') });

    const loginBtn = page
      .locator('button:has-text("登录"), button:has-text("登 录"), [class*=login][role=button]')
      .first();
    if (await loginBtn.count()) {
      console.log('[*] clicking login button ...');
      await loginBtn.click().catch((e) => console.log('click err:', e.message));
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(STATE_DIR, '03-after-login-click.png') });
    await dumpPage(page, 'after-login-click');

    // 检测滑块验证并尝试自动拖动
    const trySolveSlider = async () => {
      const slider = page
        .locator('[class*=slider] [class*=btn], [class*=slider] [class*=handler], [class*=verify] [class*=icon], [class*=drag]')
        .locator('visible=true')
        .first();
      if (!(await slider.count())) return false;
      try {
        const box = await slider.boundingBox({ timeout: 3000 });
        if (!box) return false;
        console.log('[*] slider detected, attempting drag ...');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 30; i++) {
          await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2, { steps: 2 });
          await page.waitForTimeout(30);
        }
        await page.mouse.up();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(STATE_DIR, '03b-after-slider.png') });
        return true;
      } catch (e) {
        console.log('[*] slider drag fail:', e.message.split('\n')[0]);
        return false;
      }
    };
    await trySolveSlider();
    await dumpPage(page, 'after-slider');
  }

  // 等待登录成功（headless 120s；有头模式 300s，供人工处理滑块/验证码）
  const deadline = Date.now() + (headless ? 120000 : 300000);
  let logged = false;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!/login|passport|captcha/i.test(url) && (await page.locator('input[type=password]').count()) === 0) {
      logged = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (logged) {
    await page.waitForTimeout(3000);
    await ctx.storageState({ path: STATE_FILE });
    await page.screenshot({ path: path.join(STATE_DIR, '04-logged-in.png') });
    console.log('\n[OK] 登录成功，state 已保存到 state/auth.json');
    await dumpPage(page, 'post-login');
  } else {
    await page.screenshot({ path: path.join(STATE_DIR, '04-not-logged.png') });
    console.log('\n[FAIL] 120s 内未检测到登录成功（可能需要滑块/验证码）。截图见 state/。');
    console.log('请用 HEADLESS=0 node login.cjs 有头模式人工完成验证。');
    process.exitCode = 2;
  }

  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
