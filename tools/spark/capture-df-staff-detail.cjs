#!/usr/bin/env node
// 打开员工矩阵分析页，捕获页面真实发出的 target_detail_list / target_chart 请求（完整 body）
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: path.join(__dirname, 'state', 'auth-df.json'), viewport: { width: 1600, height: 900 }, timeZoneId: 'Asia/Shanghai' });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/target_detail_list|target_chart|table|export/.test(u) && req.method() === 'POST') {
      reqs.push({ url: u.replace('https://mcc.xiaohongshu.com', ''), body: req.postData() ?? '' });
    }
  });
  page.on('response', async (res) => {
    const hit = reqs.find((r) => r.url === res.url().replace('https://mcc.xiaohongshu.com', '') && r.resp === undefined);
    if (hit) { try { hit.resp = (await res.text()).slice(0, 2500); } catch {} }
  });
  await page.goto('https://mcc.xiaohongshu.com/micro/staff-data', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(9000);
  for (const r of reqs) {
    if (!/target_detail_list/.test(r.url)) continue;
    let body = r.body ?? '';
    try { body = JSON.stringify(JSON.parse(body)); } catch {}
    console.log('===', r.url);
    console.log('  req:', body.slice(0, 900));
    console.log('  resp:', (r.resp ?? '').slice(0, 600));
  }
  fs.writeFileSync(path.join(__dirname, 'state', 'df-staff-detail-reqs.json'), JSON.stringify(reqs, null, 1));
  console.log('saved', reqs.length);
  await browser.close();
})().catch((e) => { console.error('capture error:', e.message); process.exit(1); });
