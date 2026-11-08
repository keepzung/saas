#!/usr/bin/env node
// 诊断：服务器上用已推送的 XHS 会话打开搜索页，看真实状态（URL/标题/风控文案/API 列表）
const fs = require('fs');
const { createRequire } = require('module');
const req = createRequire('/opt/saas/backend/package.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { PrismaClient } = req('@prisma/client');
  const p = new PrismaClient();
  const s = await p.platformSession.findUnique({ where: { platform_label: { platform: 'xhs', label: '默认' } } });
  await p.$disconnect();
  if (!s?.storageState) {
    console.log('NO-SESSION');
    process.exit(1);
  }
  const pw = req('playwright-core');
  let exe = null;
  try {
    exe = pw.chromium.executablePath();
    if (!fs.existsSync(exe)) exe = null;
  } catch {}
  if (!exe) exe = '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
  const browser = await pw.chromium.launch({
    executablePath: exe,
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: s.storageState,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const apis = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/sns/') || u.includes('edith')) apis.push(`${res.status()} ${u.slice(0, 110)}`);
  });
  await page
    .goto(
      'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent('特斯拉') + '&source=web_explore_feed',
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    )
    .catch((e) => console.log('goto:', e.message.split('\n')[0]));
  await sleep(6000);
  console.log('URL:', page.url().slice(0, 90));
  console.log('TITLE:', await page.title().catch(() => '?'));
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '');
  console.log('BODY:', JSON.stringify(bodyText.slice(0, 150)));
  console.log('APIS:', apis.length ? '\n' + apis.slice(0, 12).join('\n') : 'none');
  await browser.close();
})().catch((e) => {
  console.error('ERR', e.message.split('\n')[0]);
  process.exit(1);
});
