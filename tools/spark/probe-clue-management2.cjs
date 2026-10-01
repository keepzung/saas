#!/usr/bin/env node
// 线索经营探针第 2 轮：
//  A. 客户行为 [1][2][3] 三分类 total（对齐 09-24~09-30，对账概览卡 321/987/1496）
//  B. 筛选面板 归属账号=特斯拉 → 学请求参数名 + 官号-only total
//  C. 线索视图行结构（找 广告/自然 来源字段）
//  D. 筛选生效时 statistic 卡片是否联动
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'pro-clue');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(__dirname, 'state', 'auth-tesla2.json');
const CLUE_PAGE = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const captured = [];
(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN', viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();
  page.on('response', async (res) => {
    const u = res.url();
    if (!/\/ads\/api\/clue\//.test(u)) return;
    let body = '';
    try { body = await res.text(); } catch {}
    captured.push({ u: u.slice(0, 160), req: res.request().postData() || '', res: body.slice(0, 120000), t: Date.now() });
  });

  console.log('[1] 打开线索经营页 ...');
  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(9000);
  if (/login|passport/i.test(page.url())) { console.log('登录失效'); await browser.close(); process.exit(1); }

  // 直接 API 探测：三分类 total（对齐 09-24~09-30）+ 线索视图行结构
  console.log('[2] API 直查：客户行为三分类 total ...');
  const apiProbe = await page.evaluate(async () => {
    const post = async (p, body) => {
      const r = await fetch(`https://pro.xiaohongshu.com/ads/api/clue/${p}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const out = {};
    for (const ev of [1, 2, 3]) {
      const j = await post('user/list', { startTime: '2026-09-24', endTime: '2026-09-30', clueEventTypeList: [ev], pageNum: 1, pageSize: 1 });
      out[`ev${ev}`] = { cluePageInfo: j?.data?.cluePageInfo ?? null, firstRowKeys: j?.data?.userList?.[0] ? Object.keys(j.data.userList[0]) : [], sample: j?.data?.userList?.[0] ?? null };
    }
    // statistic 对照（含/不含官号没有参数差异——基线）
    out.statistic = (await post('user/statistic', { startTime: '2026-09-24', endTime: '2026-09-30', sysTagIds: ['2', '3', '4', '11', '12'], userTagIds: [] }))?.data ?? null;
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'probe2-api-direct.json'), JSON.stringify(apiProbe, null, 1), 'utf8');
  for (const k of ['ev1', 'ev2', 'ev3']) {
    const e = apiProbe[k];
    console.log(`  ${k}: pageInfo=${JSON.stringify(e.cluePageInfo)}`);
  }

  // B. UI 筛选：归属账号=特斯拉（学参数名）
  console.log('[3] 筛选 归属账号=特斯拉 ...');
  captured.length = 0;
  await page.locator('text=筛选').locator('visible=true').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(1500);
  // 归属账号下拉
  const accSelect = page.locator('text=归属账号').locator('..').locator('select, [class*=select], [class*=cascader], [class*=picker]').first();
  const accSelectAlt = page.locator('[class*=filter] :text("归属账号")').locator('..').first();
  let clicked = false;
  for (const loc of [accSelect, accSelectAlt]) {
    if (await loc.count().catch(() => 0)) { await loc.click({ timeout: 4000 }).catch(() => {}); clicked = true; break; }
  }
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '05-account-dropdown.png') });
  // 下拉选项里选「特斯拉」（精确）
  const opt = page.locator(`[class*=option]:has-text("特斯拉"), li:has-text("特斯拉"), [class*=item]:has-text("特斯拉")`).locator('visible=true').first();
  if (await opt.count().catch(() => 0)) await opt.click({ timeout: 4000 }).catch(() => {});
  await sleep(800);
  // 确定/筛选按钮
  for (const t of ['确 定', '确定', '查 询', '查询']) {
    const b = page.locator(`button:has-text("${t}")`).locator('visible=true').first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); break; }
  }
  await sleep(6000);
  const filterReqs = captured.map((c) => ({ u: c.u, req: c.req.slice(0, 600) }));
  fs.writeFileSync(path.join(OUT, 'probe2-filter-reqs.json'), JSON.stringify(filterReqs, null, 1), 'utf8');
  console.log('  筛选后请求:', JSON.stringify(filterReqs.slice(0, 6), null, 1).slice(0, 1500));
  await page.screenshot({ path: path.join(OUT, '06-filter-tesla.png') });

  // C. 筛选=特斯拉 时各行为 total（官号-only）
  console.log('[4] 特斯拉官号-only 三分类 total ...');
  const teslaTotals = await page.evaluate(async () => {
    const post = async (p, body) => {
      const r = await fetch(`https://pro.xiaohongshu.com/ads/api/clue/${p}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const out = {};
    for (const ev of [1, 2, 3]) {
      const j = await post('user/list', { startTime: '2026-09-24', endTime: '2026-09-30', clueEventTypeList: [ev], pageNum: 1, pageSize: 1 });
      out[`ev${ev}`] = j?.data?.cluePageInfo ?? null;
    }
    return out;
  });
  console.log('  官号-only:', JSON.stringify(teslaTotals));
  fs.writeFileSync(path.join(OUT, 'probe2-tesla-totals.json'), JSON.stringify(teslaTotals, null, 1), 'utf8');

  // D. 线索视图行结构（找广告/自然来源字段）
  console.log('[5] 线索视图 ...');
  captured.length = 0;
  await page.locator('text=线索视图').locator('visible=true').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(6000);
  await page.screenshot({ path: path.join(OUT, '07-clue-view.png') });
  const clueViewReqs = captured.map((c) => ({ u: c.u, req: c.req.slice(0, 800), resHead: c.res.slice(0, 2500) }));
  fs.writeFileSync(path.join(OUT, 'probe2-clue-view.json'), JSON.stringify(clueViewReqs, null, 1), 'utf8');
  console.log('  线索视图请求:', JSON.stringify(clueViewReqs.map((c) => ({ u: c.u, req: c.req.slice(0, 300) })), null, 1).slice(0, 1200));

  await browser.close();
  console.log('[done] pro-clue/probe2-*.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
