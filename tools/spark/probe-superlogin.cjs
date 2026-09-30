// superlogin 链路探测：hall 账密登录 partner → 子账户「跳转」SSO → 聚光会话 → 笔记报表页全量抓包
// 用法:
//   node probe-superlogin.cjs               （无头；partner 滑块失败时改 HEADLESS=0 人工过）
//   HEADLESS=0 node probe-superlogin.cjs    （有头，人工辅助）
// 输出: state/partner-full/superlogin-apis.json（全量请求+响应体）、superlogin-*.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'partner-full');
fs.mkdirSync(OUT, { recursive: true });
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const VSILLER_ID = process.env.VSELLER_ID || '65ddbf44275f9b000187a7bb'; // 子账户（此前报表页用）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const headless = process.env.HEADLESS !== '0';
  const browser = await chromium.launch({ headless, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });

  // ── 1) partner 登录（有 storageState 先试，失败则账密）──
  const stateFile = path.join(OUT, 'partner-state-latest.json');
  const ctxOpts = { userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } };
  await ctx.close();
  const ctx2 = await browser.newContext(
    fs.existsSync(stateFile) ? { ...ctxOpts, storageState: stateFile } : ctxOpts,
  );
  const page = await ctx2.newPage();
  let loggedIn = false;
  const ensure = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);
    return !/login|signin/i.test(page.url());
  };
  loggedIn = await ensure('https://partner.xiaohongshu.com/partner/watch-dashboard');
  if (!loggedIn) {
    // 读取 backend/.env 的 PARTNER_LOGIN_USER/PASS
    const envPath = path.resolve(__dirname, '../../backend/.env');
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    const ACCOUNT = env.PARTNER_LOGIN_USER;
    const PASSWORD = env.PARTNER_LOGIN_PASS;
    console.log('[login] partner 登录页，账密填充:', ACCOUNT);
    try {
      const tab = page.locator('text=/账号登录/').first();
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); await sleep(600); }
      await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').first().fill(ACCOUNT);
      await page.locator('input[type="password"]').first().fill(PASSWORD);
      await sleep(300);
      await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
    } catch (e) {
      console.log('[login] 自动填充失败:', String(e).slice(0, 80), '— 若有滑块请在窗口人工完成');
    }
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      if (!/login|signin/i.test(page.url())) { loggedIn = true; break; }
      if (i % 10 === 9) console.log('[login] 等待登录中...');
    }
  }
  if (!loggedIn) { console.log('partner 登录失败'); await browser.close(); process.exit(1); }
  fs.writeFileSync(stateFile, JSON.stringify(await ctx2.storageState()), 'utf8');
  console.log('[login] partner 已登录，state 已存');
  await page.screenshot({ path: path.join(OUT, 'superlogin-partner-home.png') });

  // ── 2) 全量抓包（请求+响应体）──
  const apis = [];
  const SNIFF = /\/api\/|aurora|leona|gateway|report|nebula|datareport/i;
  page.on('request', (req) => {
    const u = req.url();
    if (SNIFF.test(u) && !/\.js|\.css|\.png|\.svg|\.woff|spider-tracker|apm-fe/.test(u)) {
      apis.push({ u: u.slice(0, 300), m: req.method(), b: (req.postData() || '').slice(0, 1500), r: null });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (SNIFF.test(u) && !/\.js|\.css|\.png|\.svg|\.woff|spider-tracker|apm-fe/.test(u)) {
      const hit = [...apis].reverse().find((a) => a.u === u.slice(0, 300) && a.r === null);
      if (hit) {
        try { hit.r = (await res.text()).slice(0, 4000); } catch { hit.r = '(body unavailable)'; }
      } else {
        let body = '(body unavailable)';
        try { body = (await res.text()).slice(0, 4000); } catch {}
        apis.push({ u: u.slice(0, 300), m: res.request().method(), b: (res.request().postData() || '').slice(0, 1500), r: body });
      }
    }
  });

  // ── 3) 子账户列表页 → 点「跳转」捕获 SSO popup ──
  console.log('[jump] 打开子账户列表 ...');
  await page.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  // 移除引导遮罩
  await page.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], .d-modal-mask, [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了', '关闭']) {
    const b = page.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1200 }).catch(() => {});
  }
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'superlogin-subaccount.png') });

  const popupPromise = ctx2.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  const jumpBtn = page.locator('text=跳转').first();
  if (await jumpBtn.count()) {
    await jumpBtn.click();
    console.log('[jump] 已点击跳转，等待 popup ...');
  } else {
    console.log('[jump] 未找到跳转按钮（页面结构变化？）');
  }
  const popup = await popupPromise;
  let juguangPage = null;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
    console.log('[jump] popup URL:', popup.url().slice(0, 140));
    juguangPage = popup;
  } else {
    // 可能同窗跳转
    await sleep(5000);
    if (/ad\.xiaohongshu\.com/.test(page.url())) juguangPage = page;
  }
  await sleep(6000);

  // ── 4) 聚光会话 → 笔记报表页 ──
  if (juguangPage && /ad\.xiaohongshu\.com/.test(juguangPage.url())) {
    console.log('[report] 聚光会话 OK，打开笔记报表页 ...');
    await juguangPage.goto(
      `https://ad.xiaohongshu.com/aurora/ad/datareports-createsimple/note?vSellerId=${VSILLER_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 },
    ).catch(() => {});
    await sleep(15000);
    await juguangPage.screenshot({ path: path.join(OUT, 'superlogin-note-report.png'), fullPage: false });
    const info = await juguangPage.evaluate(() => ({
      url: location.href.slice(0, 120),
      title: document.title.slice(0, 40),
      tables: document.querySelectorAll('table').length,
      rows: document.querySelectorAll('table tr, [class*="row"]').length,
      snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
    }));
    console.log('[report] 页面:', JSON.stringify(info, null, 1));
  } else {
    console.log('[report] 未获得聚光会话（popup 未打开或非聚光域名）');
    if (juguangPage) await juguangPage.screenshot({ path: path.join(OUT, 'superlogin-popup.png') }).catch(() => {});
  }

  fs.writeFileSync(path.join(OUT, 'superlogin-apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  console.log(`[out] 捕获 ${apis.length} 条 API（请求+响应体）→ state/partner-full/superlogin-apis.json`);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
