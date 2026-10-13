#!/usr/bin/env node
// 验证 auth-df.json 登录态：访问一个用户主页，看是否被重定向到登录页
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '../../backend', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(__dirname, 'state/auth-df.json');
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const ws = (st.cookies ?? []).find((c) => c.name === 'web_session');
  console.log('web_session 值长度:', ws ? ws.value.length : '(无)');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : undefined,
    args: ['--no-proxy-server', '--no-sandbox'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN' });
  await ctx.addCookies((st.cookies ?? []).map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
  const page = await ctx.newPage();
  // 用清单里的第一个真实 UID 测试
  const testUid = '6a607839000000000c001402';
  const res = await page.goto(`https://www.xiaohongshu.com/user/profile/${testUid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);
  const finalUrl = page.url();
  const title = await page.title().catch(() => '');
  const avatar = await page.evaluate(() => {
    const img = document.querySelector('img.user-image, img.author-avatar, .user-avatar img, .avatar img, .user-image img');
    return img?.src ?? null;
  });
  console.log('status:', res.status(), '| finalUrl:', finalUrl.slice(0, 60));
  console.log('title:', title.slice(0, 50));
  console.log('头像:', avatar ? avatar.slice(0, 90) : '(未取到)');
  await browser.close();
  console.log(/login|passport/i.test(finalUrl) ? '结论: 登录态无效' : '结论: 登录态有效');
})();
