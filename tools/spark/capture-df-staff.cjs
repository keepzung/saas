#!/usr/bin/env node
// 用 DF 登录态探测 MCC 员工矩阵分析（/micro/staff-data）页面：XHR 捕获（员工列表/头像/指标）
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
    if (/api\//.test(u) && req.method() === 'POST') captured.push({ url: u, body: req.postData()?.slice(0, 1500) ?? '' });
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (/api\//.test(u) && res.request().method() === 'POST') {
      try {
        const body = (await res.text()).slice(0, 4000);
        const hit = captured.find((c) => c.url === u && c.resp === undefined);
        if (hit) hit.resp = body;
      } catch { /* ignore */ }
    }
  });
  for (const url of ['https://mcc.xiaohongshu.com/micro/staff-data', 'https://mcc.xiaohongshu.com/micro/data-monitor']) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(6000);
  }
  fs.writeFileSync(path.join(__dirname, 'state', 'df-staff-capture.json'), JSON.stringify(captured, null, 1));
  for (const c of captured) {
    const u = c.url.replace('https://mcc.xiaohongshu.com', '');
    if (/staff|employee|matrix|avatar|head|user/i.test(u + c.body)) {
      console.log('=== ', u);
      console.log('  req:', (c.body ?? '').slice(0, 300));
      console.log('  resp:', (c.resp ?? '').slice(0, 800));
    }
  }
  console.log('total captured:', captured.length);
  await browser.close();
})().catch((e) => { console.error('capture error:', e.message); process.exit(1); });
