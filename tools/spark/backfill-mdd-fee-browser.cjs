#!/usr/bin/env node
// MDD 投放数据浏览器补数：登录态浏览器打开星火数据页，页面内 fetch rtb_metrics，
// 拿到 10.1/10.2 的分账户投放行（含消耗/私信三数），输出 JSON 供入库。
// 用法: node backfill-mdd-fee-browser.cjs --start 2026-10-01 --end 2026-10-02 [--org 1942550061000474624]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(__dirname, 'package.json'));
let chromium;
try { ({ chromium } = sparkRequire('playwright')); } catch { ({ chromium } = sparkRequire(path.join(ROOT, 'backend', 'node_modules', 'playwright-core'))); }

const COOKIE_FILE = path.join(__dirname, 'state', 'mcc-cookie-b5.txt');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const START = arg('--start', '2026-10-01');
const END = arg('--end', '2026-10-02');
const ORG = arg('--org', process.env.SPARK_ORG_CODE || '1942550061000474624');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const flat = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
  const cookies = flat.split('; ').filter(Boolean).map((p) => {
    const idx = p.indexOf('=');
    return { name: p.slice(0, idx), value: p.slice(idx + 1), domain: '.xiaohongshu.com', path: '/' };
  });
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1500, height: 900 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto('https://mcc.xiaohongshu.com/micro/aurora-data', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(6000);
  if (/login|passport/i.test(page.url())) {
    console.error('[失败] 登录态无效，落在登录页。请重跑 mcc-login-headed.cjs');
    await browser.close();
    process.exit(2);
  }
  const out = {};
  for (const day of [START, END]) {
    const r = await page.evaluate(async ({ day, org }) => {
      const res = await fetch('/api/mcc/board/rtb_metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          timeEnd: day, timeStart: day, showStar: false, accountOrgCode: org, accountCode: '',
          pageIndex: 1, pageSize: 500, tagIds: [], launchStatus: '',
        }),
      });
      const j = await res.json().catch(() => null);
      return { status: res.status, code: j?.code, total: j?.data?.total ?? 0, rows: j?.data?.rtbAccountMetricsVos ?? [] };
    }, { day, org: ORG });
    console.error(`[fetch] ${day}: status=${r.status} code=${r.code} rows=${r.rows.length}`);
    out[day] = r;
    await sleep(2000);
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
