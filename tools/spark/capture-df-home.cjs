#!/usr/bin/env node
// 用已保存的 DF 登录态（storageState）打开 MCC 首页，捕获组织级效果趋势 API（请求 URL+体+响应摘要）
// 用法: node capture-df-home.cjs
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, 'state', 'auth-df.json'),
    viewport: { width: 1600, height: 900 },
    timeZoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();
  const captured = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/api\/(mcc|vision|edith)/.test(u) && req.method() === 'POST') {
      captured.push({ url: u, body: req.postData()?.slice(0, 2000) ?? '' });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (/api\/(mcc|vision)/.test(u) && res.request().method() === 'POST') {
      try {
        const body = (await res.text()).slice(0, 3000);
        const hit = captured.find((c) => c.url === u && !c.resp);
        if (hit) hit.resp = body;
      } catch { /* ignore */ }
    }
  });
  await page.goto('https://mcc.xiaohongshu.com/micro/home', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const out = path.join(__dirname, 'state', 'df-home-capture.json');
  fs.writeFileSync(out, JSON.stringify(captured, null, 1));
  console.log('captured', captured.length, 'requests →', out);
  for (const c of captured) {
    console.log('---', c.url.replace('https://mcc.xiaohongshu.com', ''));
    if (c.body) console.log('  req:', c.body.slice(0, 400));
    if (c.resp) console.log('  resp:', c.resp.slice(0, 300));
  }
  await browser.close();
})().catch((e) => { console.error('capture error:', e.message); process.exit(1); });
