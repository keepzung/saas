#!/usr/bin/env node
// 探针(一次性): ①MCC 账户报表页(赞 2355 来源) ②专业号获客工具分析页(企微 320 来源) —— 抓页面真实 API 与数值
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.env.BACKEND_DIR || '/opt/saas/backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();
let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = req('playwright-core').chromium; }

function parseCookieStr(str) {
  return str.split(/;\s*/).map((p) => { const i = p.indexOf('='); return i > 0 ? { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), domain: '.xiaohongshu.com', path: '/' } : null; }).filter(Boolean);
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function capture(page, patterns) {
  const hits = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!patterns.test(url)) return;
      if (/spider-tracker|apm|collect|abtest|robin|shield/.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 1200);
      hits.push({ url: url.slice(0, 150), body });
    } catch { /* ignore */ }
  });
  return hits;
}

(async () => {
  // ── ① MCC 账户报表（找「点赞」口径） ──
  const mcc = await prisma.sparkOrgConfig.findUnique({ where: { brandId: 5 } });
  const b1 = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled', '--no-sandbox'] });
  const c1 = await b1.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1700, height: 1000 } });
  await c1.addCookies(parseCookieStr(mcc.cookie));
  const p1 = await c1.newPage();
  const hits1 = await capture(p1, /report|aurora|account.*metric|marketing|mcc\/api|edith/i);
  console.log('[MCC] 打开账户报表页 ...');
  try {
    await p1.goto('https://mcc.xiaohongshu.com/micro/aurora-data', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p1.waitForTimeout(12000);
    const t1 = await p1.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500));
    console.log('[MCC] 页面摘要:', t1.slice(0, 260));
    console.log('[MCC] 捕获 API:');
    for (const h of hits1.slice(0, 12)) console.log('  ', h.url, '|', h.body.slice(0, 200));
  } catch (e) { console.log('[MCC] FAIL', String(e).slice(0, 150)); }
  await b1.close();

  // ── ② 专业号 获客工具分析（找企微 320） ──
  const pro = await prisma.proOrgConfig.findUnique({ where: { brandId: 5 } });
  const b2 = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled', '--no-sandbox'] });
  const c2 = await b2.newContext({ storageState: JSON.parse(pro.storageState), userAgent: UA, locale: 'zh-CN', viewport: { width: 1700, height: 1000 } });
  const p2 = await c2.newPage();
  const hits2 = await capture(p2, /clue|tool|statistic|edith/i);
  console.log('[PRO] 打开获客工具分析页 ...');
  for (const u of ['https://pro.xiaohongshu.com/enterprise/data/new-clue-management?tabsKey=toolAnalysis', 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management']) {
    try {
      await p2.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p2.waitForTimeout(9000);
      break;
    } catch (e) { console.log('[PRO] goto 重试:', String(e).slice(0, 100)); }
  }
  const t2 = await p2.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 900));
  console.log('[PRO] URL=', p2.url());
  console.log('[PRO] 页面摘要:', t2.slice(0, 500));
  console.log('[PRO] 捕获 API:');
  for (const h of hits2.slice(0, 12)) console.log('  ', h.url, '|', h.body.slice(0, 240));
  await b2.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FAIL', String(e).slice(0, 300)); process.exit(1); });
