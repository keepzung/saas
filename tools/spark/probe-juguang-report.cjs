#!/usr/bin/env node
// 聚光笔记报表定向探针 v2：跳转（重试）→ 导航到标准投笔记报表页 → 对照 API/pageSize/区间
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  const pc = backendRequire('playwright-core');
  const findChromium = () => {
    const bases = [process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null, '/root/.cache/ms-playwright', '/home/deploy/.cache/ms-playwright', path.join(process.env.HOME ?? '', '.cache/ms-playwright')].filter(Boolean);
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
      for (const d of dirs) for (const sub of ['chrome-linux', 'chrome-win64', 'chrome-win']) {
        const exe = path.join(base, d, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
        if (fs.existsSync(exe)) return exe;
      }
    }
    return null;
  };
  const exe = findChromium();
  chromium = { launch: (opts) => pc.chromium.launch({ ...opts, executablePath: exe ?? undefined }) };
}
const { PrismaClient } = backendRequire('@prisma/client');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGET = process.env.TARGET || '特斯拉KOS项目-基础';

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: 6 } });
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const mkCtx = async (cookieStr) => {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
    if (cookieStr) await ctx.addCookies(cookieStr.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
    return ctx;
  };
  const ctx = await mkCtx(cfg?.cookie);
  const listPage = await ctx.newPage();
  await listPage.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  if (/login/i.test(listPage.url())) { console.log('partner 会话失效'); await browser.close(); process.exit(1); }
  await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = listPage.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);

  // 找目标行（跨页）
  const rowsLoc = listPage.locator('tbody tr');
  let targetIdx = -1;
  for (let pg = 0; pg < 4 && targetIdx < 0; pg++) {
    const rowCount = await rowsLoc.count();
    for (let i = 0; i < rowCount; i++) {
      const txt = (await rowsLoc.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (txt.includes(TARGET)) { targetIdx = i; break; }
    }
    if (targetIdx < 0) {
      const nextBtn = listPage.locator('[class*=pagination] [class*=next], li[class*=next], button[class*=next]').locator('visible=true').first();
      if (!(await nextBtn.count())) break;
      const disabled = await nextBtn.evaluate((el) => el.className.includes('disabled') || el.getAttribute('disabled') !== null).catch(() => true);
      if (disabled) break;
      await nextBtn.click({ timeout: 5000 }).catch(() => {});
      await sleep(5000);
    }
  }
  if (targetIdx < 0) { console.log('未找到', TARGET); await browser.close(); process.exit(1); }

  // 跳转（最多 3 次重试）
  let popup = null;
  for (let attempt = 1; attempt <= 3 && !popup; attempt++) {
    const rowJump = rowsLoc.nth(targetIdx).locator('text=跳转').first();
    const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
    await rowJump.click({ timeout: 8000 }).catch(() => {});
    await sleep(3500);
    popup = await popupPromise;
    if (!popup) {
      await rowJump.hover({ timeout: 4000 }).catch(() => {});
      await sleep(1200);
      const picks = listPage.locator('text="聚光平台"');
      for (let i = 0; i < (await picks.count()); i++) {
        if (await picks.nth(i).isVisible().catch(() => false)) {
          const pp2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
          await picks.nth(i).click({ timeout: 6000 }).catch(() => {});
          popup = await pp2;
          break;
        }
      }
    }
    if (!popup && attempt < 3) { console.log(`[jump] 第 ${attempt} 次失败，重试`); await sleep(3000); }
  }
  if (!popup) { console.log('未进入聚光'); await browser.close(); process.exit(1); }
  await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await sleep(5000);
  const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? '';
  console.log('[1] vSellerId=', vseller);

  // 捕获页面自身请求
  const pageReqs = [];
  popup.on('request', (req) => {
    const u = req.url();
    if (/report|data/i.test(u) && req.method() === 'POST') pageReqs.push({ u: u.slice(0, 140), body: (req.postData() || '').slice(0, 1500) });
  });

  // 关键：先导航到标准投笔记报表页
  console.log('[2] 导航到笔记报表页 ...');
  await popup.goto(`https://ad.xiaohongshu.com/aurora/ad/datareports-basic/note?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  const info = await popup.evaluate(() => ({ url: location.href.slice(0, 130), snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200) }));
  console.log('[2] 页面:', JSON.stringify(info));

  // 从该页上下文 fetch 对照
  const results = await popup.evaluate(async () => {
    const post = async (body) => {
      const r = await fetch('https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch {}
      const dl = j?.data?.dataList ?? [];
      return { status: r.status, code: j?.code, msg: j?.msg, rows: dl.length, totalPage: j?.data?.page?.totalPage, total: j?.data?.page?.total, sample: dl[0] ? String(dl[0].dataValueJson).slice(0, 260) : null, rawHead: j ? undefined : raw.slice(0, 150) };
    };
    const base = { sorts: [], filters: [], dataCaliber: 0, timeUnit: 'DAY', splitColumns: [], webModule: 'base_report_page', dataSource: 'note', dataPattern: 'table', columns: ['time', 'noteId', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'initiativeMessage', 'msgLeadsNum'] };
    const out = {};
    out['ps20_0925_0930'] = await post({ ...base, pageNum: 1, pageSize: 20, startDate: '2026-09-25', endDate: '2026-09-30' });
    out['ps1000_0925_0930'] = await post({ ...base, pageNum: 1, pageSize: 1000, startDate: '2026-09-25', endDate: '2026-09-30' });
    out['ps20_0910_0918'] = await post({ ...base, pageNum: 1, pageSize: 20, startDate: '2026-09-10', endDate: '2026-09-18' });
    out['ps20_1001_1001'] = await post({ ...base, pageNum: 1, pageSize: 20, startDate: '2026-10-01', endDate: '2026-10-01' });
    return out;
  }).catch((e) => ({ fetchErr: String(e).slice(0, 200) }));
  console.log(JSON.stringify(results, null, 1).slice(0, 3000));

  console.log('\n[3] 页面自身请求（前 5）:');
  for (const r of pageReqs.slice(0, 5)) console.log(' ', r.u, '|', r.body.slice(0, 300));

  await browser.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
