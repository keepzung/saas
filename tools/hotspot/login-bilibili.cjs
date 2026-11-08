#!/usr/bin/env node
// 灵感引擎·B站登录：有头浏览器扫码/账号登录 → 保存 storageState → 自动推送到生产库
// 用法: node login-bilibili.cjs [--no-push]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(ROOT, 'tools', 'spark', 'package.json'));
const { chromium } = sparkRequire('playwright');

const STATE = path.join(__dirname, 'state', 'bilibili.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const NO_PUSH = process.argv.includes('--no-push');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-proxy-server'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto('https://passport.bilibili.com/login', { waitUntil: 'domcontentloaded' });
  console.log('[login-bili] 已打开 B 站登录页，请扫码/登录（10 分钟超时）…');

  const ok = await (async () => {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const logged = await page
        .evaluate(() => {
          const m = document.cookie.match(/DedeUserID=(\d+)/);
          if (m) return true;
          return false;
        })
        .catch(() => false);
      if (logged) return true;
      if (page.url().includes('passport.bilibili.com') === false) {
        // 跳出登录页视为成功
        const has = await page.context().cookies('https://www.bilibili.com');
        if (has.some((c) => c.name === 'DedeUserID')) return true;
      }
      if (i > 0 && i % 30 === 0) console.log('[login-bili] 等待登录中…');
    }
    return false;
  })();

  if (ok) {
    // 跳到主站补全 cookie 上下文
    await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');
    console.log(`[login-bili] 登录成功，state 已保存: ${STATE}`);
  } else {
    console.log('[login-bili] 未检测到登录，退出');
  }
  await browser.close();
  if (ok && !NO_PUSH) {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [path.join(__dirname, 'push-session.cjs'), 'bilibili'], { stdio: 'inherit' });
    process.exit(r.status === 0 ? 0 : 1);
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
