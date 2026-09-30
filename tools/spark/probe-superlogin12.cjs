// superlogin 第十二轮：遍历全部子账户 → 各自聚光视图拉 9 月分日数据 → 与 xlsx 对账
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await page.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = page.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);

  // 收集每行的（名称、子账号ID、行内跳转）
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  console.log('[1] 行数:', rowCount);
  const accounts = [];
  for (let i = 0; i < rowCount; i++) {
    const txt = (await rows.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const idm = txt.match(/([0-9a-f]{24})/);
    if (idm) accounts.push({ name: txt.split(' ')[0].slice(0, 30), id: idm[1], idx: i });
  }
  console.log('[1] 子账户:', JSON.stringify(accounts.map((a) => a.name)));

  const daily = new Map(); // day -> {fee, imp, click, interaction, inq}
  const perAccount = [];
  for (const acc of accounts) {
    const row = rows.nth(acc.idx);
    const rowJump = row.locator('text=跳转').first();
    const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
    await rowJump.click({ timeout: 8000 }).catch(() => {});
    await sleep(3500);
    let popup = await popupPromise;
    if (!popup) {
      await rowJump.hover({ timeout: 4000 }).catch(() => {});
      await sleep(1200);
      const picks = page.locator('text="聚光平台"');
      const n = await picks.count();
      for (let i = 0; i < n; i++) {
        if (await picks.nth(i).isVisible().catch(() => false)) {
          const pp2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
          await picks.nth(i).click({ timeout: 6000 }).catch(() => {});
          popup = await pp2;
          break;
        }
      }
    }
    if (!popup) { console.log(`[${acc.name}] 未进入聚光，跳过`); continue; }
    await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
    await sleep(6000);
    const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? acc.id;
    // 拉分日数据（页面上下文 fetch）
    const r = await popup.evaluate(async () => {
      const res = await fetch('https://ad.xiaohongshu.com/api/light/ad/report/data/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: '2026-09-01', endDate: '2026-09-30', webModule: 'base_report_page',
          dataPattern: 'line_chart', dataSource: 'campaign',
          columns: ['time', 'fee', 'impression', 'click', 'interaction', 'messageConsult'],
          filters: [], timeUnit: 'DAY',
        }),
      });
      return (await res.text()).slice(0, 300000);
    }).catch((e) => String(e).slice(0, 100));
    let dayCount = 0;
    let feeSum = 0;
    try {
      const j = JSON.parse(r);
      const list = j?.data?.dataList ?? [];
      for (const item of list) {
        const v = JSON.parse(item.dataValueJson);
        const day = v.time;
        if (!day) continue;
        const cur = daily.get(day) ?? { fee: 0, imp: 0, click: 0, interaction: 0, inq: 0 };
        cur.fee += Number(v.fee ?? 0);
        cur.imp += Number(v.impression ?? 0);
        cur.click += Number(v.click ?? 0);
        cur.interaction += Number(v.interaction ?? 0);
        cur.inq += Number(v.messageConsult ?? 0);
        daily.set(day, cur);
        dayCount += 1;
        feeSum += Number(v.fee ?? 0);
      }
    } catch (e) {
      console.log(`[${acc.name}] 解析失败:`, r.slice(0, 120));
    }
    perAccount.push({ name: acc.name, vseller, dayCount, feeSum: feeSum.toFixed(2) });
    console.log(`[${acc.name}] ${dayCount} 天, fee=${feeSum.toFixed(2)}`);
    await popup.close().catch(() => {});
    await sleep(2000);
  }

  console.log('\n===== 聚光 9 月分日（12 账户合并）vs xlsx =====');
  // xlsx 9 月分日基准
  const { createRequire } = require('module');
  const F = createRequire(path.resolve(__dirname, '../../frontend/noop.js'));
  const XLSX = F('xlsx');
  const wb = XLSX.readFile(path.resolve(__dirname, '../../tesla/特斯拉投放数据源.xlsx'), { cellDates: true });
  const xrows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  const xByDay = new Map();
  let xTotal = 0;
  for (const r of xrows) {
    const d = r['时间'] instanceof Date ? new Date(r['时间'].getTime() + 8 * 3600000).toISOString().slice(0, 10) : null;
    if (!d || !d.startsWith('2026-09')) continue;
    const cur = xByDay.get(d) ?? { fee: 0 };
    cur.fee += Number(r['消费'] ?? 0);
    xByDay.set(d, cur);
    xTotal += Number(r['消费'] ?? 0);
  }
  let jTotal = 0;
  const days = [...new Set([...daily.keys(), ...xByDay.keys()])].sort();
  console.log('日期        | 聚光消费   | xlsx消费   | 比率');
  for (const d of days) {
    const jv = (daily.get(d) ?? { fee: 0 }).fee;
    const xv = (xByDay.get(d) ?? { fee: 0 }).fee;
    jTotal += jv;
    const ratio = xv > 0 ? (jv / xv * 100).toFixed(1) + '%' : '-';
    console.log(`${d} | ${jv.toFixed(2).padStart(10)} | ${xv.toFixed(2).padStart(10)} | ${ratio}`);
  }
  console.log(`合计        | ${jTotal.toFixed(2)} | ${xTotal.toFixed(2)} | ${(xTotal > 0 ? (jTotal / xTotal * 100).toFixed(1) : '-')}%`);
  fs.writeFileSync(path.join(OUT, 'sl12-reconcile.json'), JSON.stringify({ perAccount, daily: [...daily.entries()], xTotal, jTotal }, null, 1), 'utf8');
  console.log('[out] sl12-reconcile.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
