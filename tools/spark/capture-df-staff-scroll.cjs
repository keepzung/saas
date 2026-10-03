#!/usr/bin/env node
// 滚动员工矩阵分析页，捕获全部表格/明细请求（找员工级表格+头像字段）
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, 'node_modules', 'playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: path.join(__dirname, 'state', 'auth-df.json'), viewport: { width: 1600, height: 2400 }, timeZoneId: 'Asia/Shanghai' });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/target_detail_list|target_chart|chart_data|table/i.test(u) && req.method() === 'POST') {
      reqs.push({ url: u.replace('https://mcc.xiaohongshu.com', ''), body: (req.postData() ?? '').slice(0, 1200) });
    }
  });
  page.on('response', async (res) => {
    const hit = reqs.find((r) => r.url === res.url().replace('https://mcc.xiaohongshu.com', '') && r.resp === undefined);
    if (hit) { try { hit.resp = (await res.text()).slice(0, 1500); } catch {} }
  });
  await page.goto('https://mcc.xiaohongshu.com/micro/staff-data', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1600);
  }
  // 展开所有页签按钮（图文/视频/主账户维度/员工号维度 之类）
  const btns = await page.$$('text=/员工号|员工|维度|列表/');
  for (const b of btns.slice(0, 8)) { await b.click().catch(() => {}); await page.waitForTimeout(1200); }
  await page.waitForTimeout(3000);
  fs.writeFileSync(path.join(__dirname, 'state', 'df-staff-scroll-reqs.json'), JSON.stringify(reqs, null, 1));
  for (const r of reqs) {
    let chart = '';
    try { chart = JSON.parse(r.body).chart ?? ''; } catch {}
    console.log('=== chart=', chart, r.url.slice(0, 80));
    if (r.resp && /avatar|head_img|headImg|image|staff|员工/.test(r.resp)) console.log('  RESP-HIT:', r.resp.slice(0, 700));
  }
  console.log('total:', reqs.length);
  await browser.close();
})().catch((e) => { console.error('capture error:', e.message); process.exit(1); });
