// superlogin 第二轮：partner state（已登录）→ getUserRtb 拿 adLoginUrl → 打开聚光 → 笔记报表页全量抓包（请求+响应）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const VSILLER_ID = process.env.VSELLER_ID || '65ddbf44275f9b000187a7bb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  if (!fs.existsSync(stateFile)) { console.error('缺 partner state'); process.exit(1); }
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });

  // ── 1) partner 域页面上下文 fetch getUserRtb 拿 adLoginUrl ──
  const page = await ctx.newPage();
  console.log('[1] 打开 partner 触发会话 ...');
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  const adLoginUrl = await page.evaluate(async () => {
    const r = await fetch('/api/partner/user/getUserRtb', { credentials: 'include' });
    const j = await r.json();
    return j?.data?.adLoginUrl ?? null;
  });
  console.log('[1] adLoginUrl:', adLoginUrl ? adLoginUrl.slice(0, 110) : '(null)');
  if (!adLoginUrl) { await browser.close(); process.exit(1); }

  // ── 2) 全量抓包（请求+响应）──
  const apis = [];
  const SNIFF = /\/api\/|aurora|leona|gateway|report|nebula|datareport/i;
  const attach = (pg) => {
    pg.on('request', (req) => {
      const u = req.url();
      if (SNIFF.test(u) && !/\.js|\.css|\.png|\.svg|\.woff|spider-tracker|apm-fe/.test(u)) {
        apis.push({ u: u.slice(0, 300), m: req.method(), b: (req.postData() || '').slice(0, 1500), r: null });
      }
    });
    pg.on('response', async (res) => {
      const u = res.url();
      if (SNIFF.test(u) && !/\.js|\.css|\.png|\.svg|\.woff|spider-tracker|apm-fe/.test(u)) {
        const hit = [...apis].reverse().find((a) => a.u === u.slice(0, 300) && a.r === null);
        let body = '(body unavailable)';
        try { body = (await res.text()).slice(0, 6000); } catch {}
        if (hit) hit.r = body;
        else apis.push({ u: u.slice(0, 300), m: res.request().method(), b: (res.request().postData() || '').slice(0, 1500), r: body });
      }
    });
  };

  // ── 3) 同 context 打开 adLoginUrl（聚光会话 cookie 落地）──
  console.log('[2] 打开 superlogin URL ...');
  const jg = await ctx.newPage();
  attach(jg);
  await jg.goto(adLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(10000);
  console.log('[2] 落地 URL:', jg.url().slice(0, 130));
  await jg.screenshot({ path: path.join(OUT, 'sl2-juguang-home.png') });

  // ── 4) 笔记报表页 ──
  console.log('[3] 打开笔记报表页 ...');
  await jg.goto(
    `https://ad.xiaohongshu.com/aurora/ad/datareports-createsimple/note?vSellerId=${VSILLER_ID}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  ).catch(() => {});
  await sleep(16000);
  await jg.screenshot({ path: path.join(OUT, 'sl2-note-report.png'), fullPage: false });
  const info = await jg.evaluate(() => ({
    url: location.href.slice(0, 130),
    title: document.title.slice(0, 40),
    tables: document.querySelectorAll('table').length,
    dateInputs: document.querySelectorAll('input[placeholder*="日期"], [class*="date"]').length,
    snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  }));
  console.log('[3] 页面:', JSON.stringify(info, null, 1));

  fs.writeFileSync(path.join(OUT, 'sl2-note-report-apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  console.log(`[out] 捕获 ${apis.length} 条 API → state/partner-full/sl2-note-report-apis.json`);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
