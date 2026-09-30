#!/usr/bin/env node
// 小红书主站（www.xiaohongshu.com）有头登录：人工扫码后保存 storageState
// 用法: node login-xhs-web.cjs   （登录成功自动退出，state 存 tools/spark/state/xhs-web-tesla.json）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(ROOT, 'tools', 'spark', 'package.json'));
const { chromium } = sparkRequire('playwright');

const STATE = path.join(__dirname, 'state', 'xhs-web-tesla.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-proxy-server'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto('https://www.xiaohongshu.com/', { waitUntil: 'domcontentloaded' });
  console.log('[login] 已打开小红书首页。请在窗口中点「登录」并扫码（验证码也在此窗口完成）。');

  const ok = await (async () => {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      // 多信号检测：localStorage 用户信息（强）+ DOM 头像/登录按钮（兜底）
      const logged = await page
        .evaluate(() => {
          try {
            for (const k of ['user', 'userInfo']) {
              const raw = localStorage.getItem(k);
              if (raw) {
                const u = JSON.parse(raw);
                if (u && (u.userId || u.id || u.nickname)) return true;
              }
            }
          } catch { /* fallthrough */ }
          const loginBtn = document.querySelector('.login-btn, [class*="login-btn"], [class*="loginBtn"]');
          const avatar = document.querySelector('.side-bar-component .user img, [class*="avatar"] img');
          return !loginBtn && !!avatar;
        })
        .catch(() => false);
      if (logged) return true;
      if (i > 0 && i % 30 === 0) console.log('[login] 等待扫码中（10 分钟超时）...');
    }
    return false;
  })();

  if (ok) {
    await new Promise((r) => setTimeout(r, 1500));
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');
    console.log(`[login] 登录成功，state 已保存: ${STATE}`);
  } else {
    console.log('[login] 5 分钟内未检测到登录，退出');
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
