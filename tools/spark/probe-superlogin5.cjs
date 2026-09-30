// superlogin 第五轮：数据 → 标准投 → 笔记报表（正确路径），抓真实 dataSource + 9 月数据
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ storageState: stateFile, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  const adLoginUrl = await page.evaluate(async () => {
    const r = await fetch('/api/partner/user/getUserRtb', { credentials: 'include' });
    return (await r.json())?.data?.adLoginUrl ?? null;
  });
  if (!adLoginUrl) { console.log('adLoginUrl 失败'); await browser.close(); process.exit(1); }

  // 抓报表数据请求+响应
  const reportReqs = [];
  const jg = await ctx.newPage();
  jg.on('response', async (res) => {
    const u = res.url();
    if (/report\/data\/(overall|distribution)|rtb\/common\/data\/report/.test(u) && res.request().method() === 'POST') {
      let body = '';
      try { body = (await res.text()).slice(0, 3000); } catch {}
      reportReqs.push({ u: u.slice(0, 140), req: (res.request().postData() || '').slice(0, 1200), res: body });
    }
  });

  await jg.goto(adLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(9000);
  console.log('[home]', jg.url().slice(0, 120));

  // 顶部菜单 → 数据
  console.log('[nav] 点击顶部「数据」...');
  const dataMenu = jg.locator('text=数据').first();
  await dataMenu.click({ timeout: 8000 }).catch(async () => {
    await jg.evaluate(() => {
      const els = [...document.querySelectorAll('a, span, div')];
      const t = els.find((e) => e.innerText?.trim() === '数据');
      if (t) t.click();
    });
  });
  await sleep(4000);
  await jg.screenshot({ path: path.join(OUT, 'sl5-menu-data.png') });

  // 侧边：标准投（分组）→ 笔记报表
  console.log('[nav] 点击「标准投」...');
  const stdMenu = jg.locator('text=标准投').first();
  if (await stdMenu.count()) {
    await stdMenu.click({ timeout: 6000 }).catch(() => {});
    await sleep(2500);
  } else {
    console.log('[nav] 未找到「标准投」文本，截图排查');
  }
  await jg.screenshot({ path: path.join(OUT, 'sl5-menu-std.png') });
  console.log('[nav] 点击「笔记报表」...');
  const noteMenu = jg.locator('text=笔记报表').first();
  await noteMenu.click({ timeout: 8000 }).catch(() => {});
  await sleep(15000);
  console.log('[nav] 报表页 URL:', jg.url().slice(0, 150));
  await jg.screenshot({ path: path.join(OUT, 'sl5-note-report.png'), fullPage: false });
  const info = await jg.evaluate(() => ({
    tables: document.querySelectorAll('table').length,
    snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  }));
  console.log('[nav] 页面:', JSON.stringify(info));

  // UI 改日期 09-01 ~ 09-30
  console.log('[date] 改日期为 09-01~09-30 ...');
  const inputs = jg.locator('input');
  const cnt = await inputs.count();
  let filled = 0;
  for (let i = 0; i < cnt && filled < 2; i++) {
    const el = inputs.nth(i);
    const val = await el.inputValue().catch(() => '');
    if (/2026-09-2\d$/.test(val) || /2026-10-01$/.test(val)) {
      await el.click({ timeout: 3000 }).catch(() => {});
      await sleep(600);
      await el.fill(filled === 0 ? '2026-09-01' : '2026-09-30').catch(() => {});
      await el.press('Enter').catch(() => {});
      filled++;
      await sleep(2500);
    }
  }
  console.log(`[date] 填充 ${filled} 个日期输入`);
  await sleep(8000);
  await jg.screenshot({ path: path.join(OUT, 'sl5-after-date.png'), fullPage: false });

  console.log(`\n===== 抓到报表请求 ${reportReqs.length} 条 =====`);
  for (const r of reportReqs.slice(0, 10)) {
    console.log('---', r.u);
    console.log('  REQ:', r.req.slice(0, 600));
    console.log('  RES:', r.res.slice(0, 400));
  }
  fs.writeFileSync(path.join(OUT, 'sl5-report-capture.json'), JSON.stringify(reportReqs, null, 1), 'utf8');
  console.log('[out] sl5-report-capture.json');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
