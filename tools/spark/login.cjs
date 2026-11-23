// 星火平台登录 + 登录页结构探测（多账号：TAG=tesla node login.cjs → state/auth-tesla.json）
// 用法: node login.cjs            (headless, 默认账号)
//       HEADLESS=0 node login.cjs (有头，遇到滑块时人工拖动，脚本等待登录完成)
//       TAG=tesla HEADLESS=0 node login.cjs  (特斯拉账号：读 .env SPARK_ACCOUNT_TESLA/SPARK_PASSWORD_TESLA)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 手动读 .env（不依赖 dotenv 包）
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const TAG = (process.env.TAG || '').trim();
const STATE_DIR = path.join(__dirname, 'state');
const STATE_FILE = path.join(STATE_DIR, TAG ? `auth-${TAG}.json` : 'auth.json');
fs.mkdirSync(STATE_DIR, { recursive: true });
const account = env[TAG ? `SPARK_ACCOUNT_${TAG.toUpperCase()}` : 'SPARK_ACCOUNT'] || env.SPARK_ACCOUNT;
const password =
  env[TAG ? `SPARK_PASSWORD_${TAG.toUpperCase()}` : 'SPARK_PASSWORD'] || env.SPARK_PASSWORD;

// 品牌身份档案（防串号三道闸的源头）：label 用于窗口标题/横幅/预告弹窗，
// expectedUser 与 state 里 localStorage.userName 对账——历史串号事故即userName混淆（10-26 两次）
const BRANDS = {
  RW:   { label: '荣威 RW · brand2',     expectedUser: '原山互创' },
  MDD:  { label: 'MDD摩根 MDD · brand5', expectedUser: 'mkt数据' },
  DF:   { label: '东风奕境 DF · brand7', expectedUser: 'MKT数据' },
  GREE: { label: '格力 GREE · brand8',   expectedUser: 'MKT数据' },
};
const BRAND = BRANDS[TAG.toUpperCase()] || null;

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
  // 防串号第一道：登录窗口弹出前的置顶预告（品牌+账号大字，点确定才开窗口），仅例程有头模式触发
  if (BRAND && !headless && process.env.ANNOUNCE === '1') {
    const { spawnSync } = require('child_process');
    const msg = [
      `即将弹出【${BRAND.label}】的登录窗口`,
      '',
      `自动填入账号：${account || '(未配置)'}`,
      '账密会自动填好，只需要完成滑块验证',
      '如需手动输入，请务必核对账号后缀，勿输入其他品牌账密！',
      '',
      '确认这是目标品牌后，点「确定」继续',
    ].join('\n');
    spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms|Out-Null;" +
          '$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;' +
          "[void][System.Windows.Forms.MessageBox]::Show($o,$env:BRANDGUARD_MSG,$env:BRANDGUARD_TITLE,'OK','Warning','Button1',0)",
      ],
      {
        env: {
          ...process.env,
          BRANDGUARD_MSG: msg,
          BRANDGUARD_TITLE: `每日登录例程 · ${BRAND.label}`,
        },
        stdio: 'ignore',
        timeout: 120000,
      },
    );
  }
  // NO_PROXY=1: 本机系统代理挂掉时绕过（mcc/xhs 国内直连可达）
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

  // 防串号第二道：窗口标题+置顶红条横幅写上品牌和账号（每个导航后自动重挂，页面自己改标题也会被拨回来）
  if (BRAND) {
    await ctx.addInitScript(
      ({ label, acct }) => {
        const apply = () => {
          try {
            document.title = `【${label}】此窗口只允许本品牌账密`;
            if (!document.getElementById('brand-guard-banner')) {
              const el = document.createElement('div');
              el.id = 'brand-guard-banner';
              el.style.cssText =
                'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#d62828;color:#fff;' +
                'font:700 15px/32px system-ui,sans-serif;text-align:center;pointer-events:none';
              el.textContent = `当前窗口：${label} ｜ 账号(已自动填入)：${acct} ｜ 只需完成滑块；手输前请核对账号后缀！`;
              (document.body || document.documentElement).appendChild(el);
            }
          } catch (e) {}
        };
        apply();
        setInterval(apply, 800);
      },
      { label: BRAND.label, acct: account || '' },
    );
  }

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
    await userInput.fill(account);
    await passInput.fill(password);
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
    console.log(`\n[OK] 登录成功${TAG ? `（tag=${TAG}）` : ''}，state 已保存到 ${path.relative(__dirname, STATE_FILE)}`);
    // 防串号第三道：登录完成立刻对账身份（state 里 localStorage.userName vs 品牌预期值）
    try {
      const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      let userName = '';
      for (const o of st.origins || [])
        for (const kv of o.localStorage || [])
          if (kv.name === 'userName') userName = kv.value;
      if (BRAND) {
        if (userName && userName !== BRAND.expectedUser) {
          console.error(`\n❌❌ [串号警报] 当前登录身份="${userName}"，但本窗口是【${BRAND.label}】(预期="${BRAND.expectedUser}")！`);
          console.error('❌❌ 本次不会推送生产库（push-state-to-prod 会拦截）。请回到正确品牌的登录窗口重新登录。');
          process.exitCode = 2;
        } else if (userName) {
          console.log(`[身份对账] ${TAG}: ${userName} ✓`);
        }
      }
    } catch (e) {
      console.log('[身份对账] 读取失败(忽略):', e.message);
    }
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
