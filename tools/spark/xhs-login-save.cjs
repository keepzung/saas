#!/usr/bin/env node
// 小红书主站扫码登录 + 保存登录态
// 用法: node xhs-login-save.cjs [输出文件，默认 state/auth-df.json]
// 打开有头浏览器 → 人工完成登录（扫码/验证码）→ 检测到登录成功后保存 storageState
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '../../backend', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }

const OUT = path.join(__dirname, process.argv[2] || 'state/auth-df.json');
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
  console.log('[1] 打开小红书登录页，请人工完成登录（扫码 / 短信验证码均可）…');
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

  let loggedIn = false;
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    const cookies = await ctx.cookies('https://www.xiaohongshu.com');
    const hasSession = cookies.some((c) => c.name === 'web_session');
    const url = page.url();
    if (hasSession && !/login/i.test(url)) {
      loggedIn = true;
      console.log(`[2] 检测到登录成功（第 ${Math.round((i + 1) * 3 / 60 * 10) / 10} 分钟）`);
      break;
    }
    if (i % 10 === 0) {
      const all = await ctx.cookies('https://www.xiaohongshu.com');
      const names = all.map((c) => c.name).filter((n) => /session|user/.test(n));
      console.log(`  …等待登录中 (${Math.round((i + 1) * 3 / 60 * 10) / 10} 分钟) | cookies=${all.length} | 会话相关: ${names.join(',') || '无'} | url=${url.slice(0, 50)}`);
    }
    await page.bringToFront().catch(() => {});
  }
  await sleep(2000);
  const state = await ctx.storageState();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(state), 'utf8');
  console.log(`[3] 登录态已保存: ${OUT}（loggedIn=${loggedIn}）`);
  await browser.close().catch(() => {});
  if (!loggedIn) process.exit(3);
})();
