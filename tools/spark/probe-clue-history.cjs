#!/usr/bin/env node
// 探测线索经营历史数据起点（只读）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATE = path.join(__dirname, 'state', 'auth-tesla2.json');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')), userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN', viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  if (/login|passport/i.test(page.url())) { console.log('登录失效'); await browser.close(); process.exit(1); }
  const out = await page.evaluate(async () => {
    const days = ['2025-01-15', '2025-04-15', '2025-07-15', '2025-10-15', '2026-01-15', '2026-04-15', '2026-07-15', '2026-09-15'];
    const res = {};
    for (const d of days) {
      const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/user/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ startTime: d, endTime: d, clueEventTypeList: [3], pageNum: 1, pageSize: 1 }),
      });
      const j = await r.json().catch(() => null);
      res[d] = j?.data?.cluePageInfo?.total ?? `err:${String(j?.msg ?? '').slice(0, 40)}`;
    }
    // 长区间总量（2025 全年）
    const y = await fetch('https://pro.xiaohongshu.com/ads/api/clue/user/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ startTime: '2025-01-01', endTime: '2025-12-31', clueEventTypeList: [3], pageNum: 1, pageSize: 1 }),
    });
    const yj = await y.json().catch(() => null);
    res['2025全年留资'] = yj?.data?.cluePageInfo?.total ?? `err:${String(yj?.msg ?? '').slice(0, 40)}`;
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
