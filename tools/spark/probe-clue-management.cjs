#!/usr/bin/env node
// 专业号「线索经营」探针：登录 → 数据概览卡 API + 客户视图(客户行为筛选) API 结构
// 用法: node probe-clue-management.cjs   （HEADLESS=0 人工辅助）
// 输出: tools/spark/state/pro-clue/probe-apis.json + 页面文本/截图
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'pro-clue');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(__dirname, 'state', 'auth-tesla2.json');
const CLUE_PAGE = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读 tools/spark/.env
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const USER = env.PRO_ACCOUNT || env.SPARK_ACCOUNT_TESLA2;
const PASS = env.PRO_PASSWORD || env.SPARK_PASSWORD_TESLA2;

const apis = [];
const bigBodies = [];

(async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctxOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1600, height: 1000 },
  };
  const ctx = await browser.newContext(fs.existsSync(STATE) ? { ...ctxOpts, storageState: STATE } : ctxOpts);
  const page = await ctx.newPage();

  // 捕获所有 API
  page.on('response', async (res) => {
    const u = res.url();
    if (!/pro\.xiaohongshu\.com/.test(u) || !/\/api\//.test(u)) return;
    const req = res.request();
    let body = '';
    try { body = (await res.text()).slice(0, 8000); } catch {}
    apis.push({ m: req.method(), u: u.slice(0, 220), req: (req.postData() || '').slice(0, 2000), res: body, status: res.status() });
    if (/clue|customer|overview|funnel|traffic|summary/i.test(u)) {
      try { bigBodies.push({ u, req: req.postData() || '', res: (await res.text()).slice(0, 200000) }); } catch {}
    }
  });

  console.log('[1] 打开线索经营页 ...');
  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);

  // 登录检测（跳到 login/passport 则账密登录）
  if (/login|passport/i.test(page.url())) {
    console.log('[login] 未登录，账密登录 ...');
    const userInput = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').locator('visible=true').first();
    const passInput = page.locator('input[type="password"]').locator('visible=true').first();
    await userInput.fill(USER, { timeout: 10000 }).catch(() => {});
    await passInput.fill(PASS, { timeout: 10000 }).catch(() => {});
    await sleep(500);
    const agree = page.locator('text=我已阅读并同意').first();
    if (await agree.count().catch(() => 0)) {
      try {
        const box = await agree.boundingBox({ timeout: 3000 });
        if (box) await page.mouse.click(box.x - 20, box.y + box.height / 2);
      } catch {}
    }
    await page.locator('button:has-text("登")').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(6000);
    // 滑块尝试
    const slider = page.locator('[class*=slider] [class*=btn], [class*=slider] [class*=handler], [class*=drag]').locator('visible=true').first();
    if (await slider.count().catch(() => 0)) {
      try {
        const box = await slider.boundingBox({ timeout: 3000 });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 30; i++) { await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2, { steps: 2 }); await sleep(30); }
        await page.mouse.up();
      } catch {}
      await sleep(3000);
    }
    if (/login|passport/i.test(page.url())) {
      // 直接访问线索页触发 SSO 流转
      await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(8000);
    }
    if (/login|passport/i.test(page.url())) {
      console.log('[login] 登录失败，请 HEADLESS=0 人工处理');
      await page.screenshot({ path: path.join(OUT, 'login-fail.png') });
      await browser.close();
      process.exit(1);
    }
  }
  fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()));
  console.log('[login] OK, state 已更新');

  // 等页面数据加载
  await sleep(8000);
  await page.evaluate(() => document.querySelectorAll('[class*=guide], [class*=tour], [class*=mask]').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.remove(); })).catch(() => {});
  const pageText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1500));
  console.log('[page]', JSON.stringify(pageText));
  await page.screenshot({ path: path.join(OUT, '01-page.png'), fullPage: false });

  // ── 2. 对齐行为时间到 09-24 ~ 09-30（与概览卡一致）──
  console.log('[2] 修改行为时间 09-24~09-30 ...');
  const inputs = page.locator('input');
  const cnt = await inputs.count();
  let filled = 0;
  for (let i = 0; i < cnt && filled < 2; i++) {
    const el = inputs.nth(i);
    const val = await el.inputValue().catch(() => '');
    if (/^2026-\d{2}-\d{2}$/.test(val)) {
      await el.click({ timeout: 3000 }).catch(() => {});
      await sleep(400);
      await el.fill(filled === 0 ? '2026-09-24' : '2026-09-30', { timeout: 3000 }).catch(() => {});
      await el.press('Enter').catch(() => {});
      await sleep(1200);
      filled++;
    }
  }
  console.log(`[2] 填充 ${filled} 个日期`);
  await sleep(5000);

  // ── 3. 客户行为 逐个筛选（不限/进线/开口/留资），抓列表请求与 total ──
  const behaviors = ['进线', '开口', '留资'];
  const behaviorTotals = {};
  for (const b of behaviors) {
    console.log(`[3] 客户行为=${b} ...`);
    apis.length = 0;
    // 打开下拉（客户行为 select）
    const sel = page.locator('text=客户行为').locator('..').locator('..').first();
    await sel.click({ timeout: 5000 }).catch(() => {});
    await sleep(800);
    const opt = page.locator(`li:has-text("${b}"), [class*=option]:has-text("${b}")`).locator('visible=true').first();
    if (await opt.count().catch(() => 0)) await opt.click({ timeout: 4000 }).catch(() => {});
    else await page.locator(`text=${b}`).locator('visible=true').nth(0).click({ timeout: 4000 }).catch(() => {});
    await sleep(6000);
    // 读列表总数文本
    const listText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 800));
    behaviorTotals[b] = { pageText: listText.slice(0, 400), apis: apis.filter((a) => /clue|customer|list|page/i.test(a.u)).slice(0, 6) };
    await page.screenshot({ path: path.join(OUT, `02-behavior-${b}.png`), fullPage: false });
  }

  // ── 4. 筛选面板探测（归属账号维度）──
  console.log('[4] 打开筛选面板 ...');
  apis.length = 0;
  await page.locator('text=筛选').locator('visible=true').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, '03-filter-panel.png'), fullPage: false });
  const filterText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2000));
  fs.writeFileSync(path.join(OUT, 'filter-panel.txt'), filterText, 'utf8');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(1000);

  // ── 5. 概览卡日期改单日（测任意区间）──
  console.log('[5] 概览卡日期改 09-25 ~ 09-25 ...');
  apis.length = 0;
  // 顶部概览日期选择器（页面右上）——找 2026-09-24 的输入
  const inputs2 = page.locator('input');
  const cnt2 = await inputs2.count();
  let f2 = 0;
  for (let i = 0; i < cnt2 && f2 < 2; i++) {
    const el = inputs2.nth(i);
    const val = await el.inputValue().catch(() => '');
    if (val === '2026-09-24' || val === '2026-09-30') {
      await el.click({ timeout: 3000 }).catch(() => {});
      await sleep(400);
      await el.fill(f2 === 0 ? '2026-09-25' : '2026-09-25', { timeout: 3000 }).catch(() => {});
      await el.press('Enter').catch(() => {});
      await sleep(1500);
      f2++;
    }
  }
  await sleep(4000);
  const cardText = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const i = t.indexOf('数据概览');
    return i > -1 ? t.slice(i, i + 400).replace(/\s+/g, ' ') : t.slice(0, 400);
  });
  console.log('[5] 概览卡文本:', JSON.stringify(cardText));
  await page.screenshot({ path: path.join(OUT, '04-cards-single-day.png'), fullPage: false });

  // ── 输出 ──
  fs.writeFileSync(path.join(OUT, 'probe-apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT, 'big-bodies.json'), JSON.stringify(bigBodies, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT, 'behavior-totals.json'), JSON.stringify(behaviorTotals, null, 1), 'utf8');
  console.log(`\n[out] apis=${apis.length} bigBodies=${bigBodies.length} → ${OUT}`);
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
