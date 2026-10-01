#!/usr/bin/env node
// 线索经营探针第 4 轮：d-select 正确交互 → 学归属账号参数名 → 官号-only total → statistic 联动 → 线索视图 → pageSize=1000
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'pro-clue');
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
    captured.push({ u: u.slice(0, 160), req: res.request().postData() || '', res: body.slice(0, 200000) });
  });

  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(9000);

  // 1. 打开筛选面板
  await page.locator('span:text-is("筛选"), button:has-text("筛选")').locator('visible=true').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(1500);

  // 2. 点击归属账号 d-select-wrapper 展开
  console.log('[1] 展开归属账号下拉 ...');
  await page.locator('.d-select-wrapper.search-form-item').first().click({ timeout: 5000 }).catch((e) => console.log('click err', e.message));
  await sleep(1800);
  // dump body 下的 popper
  const popperHtml = await page.evaluate(() => {
    const pops = [...document.querySelectorAll('[class*=popper], [class*=dropdown], [class*=option-list], [class*=select-menu]')].filter((e) => e.offsetParent !== null && (e.innerText || '').includes('特斯拉'));
    const el = pops.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    return el ? el.outerHTML.slice(0, 8000) : 'NOT_FOUND';
  });
  fs.writeFileSync(path.join(OUT, 'popper.html'), popperHtml, 'utf8');
  console.log('  popper:', popperHtml === 'NOT_FOUND' ? '未找到' : `已 dump (${popperHtml.length})`);
  await page.screenshot({ path: path.join(OUT, '09-dropdown-open.png') });

  // 3. 在过滤输入框输入 特斯拉 → 选精确项
  console.log('[2] 过滤并选中 特斯拉 ...');
  await page.locator('.d-select-wrapper.search-form-item input').first().fill('特斯拉', { timeout: 3000 }).catch(() => {});
  await sleep(1500);
  // 选项列表（精确「特斯拉」——innerText 恰为 特斯拉 或 特斯拉+ID）
  const picked = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[class*=option], [class*=item], li')].filter((e) => {
      const t = (e.textContent || '').trim();
      return e.offsetParent !== null && /^特斯拉\s*(ID:?\s*5cad9d23)?/.test(t) && t.length < 60;
    });
    const el = opts[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim().slice(0, 60), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('  候选项:', JSON.stringify(picked));
  if (picked) {
    await page.mouse.click(picked.x, picked.y);
    await sleep(1000);
    // 收起下拉（点面板空白）并应用筛选（查询按钮）
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(600);
    for (const t of ['查 询', '查询', '确 定', '确定']) {
      const b = page.locator(`button:has-text("${t}")`).locator('visible=true').first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); break; }
    }
    await sleep(6000);
  }
  const filterReqs = captured.filter((c) => /user\/list|statistic/.test(c.u)).map((c) => ({ u: c.u.split('/').pop(), req: c.req.slice(0, 800) }));
  fs.writeFileSync(path.join(OUT, 'probe4-filter-reqs.json'), JSON.stringify(filterReqs, null, 1), 'utf8');
  console.log('  筛选后请求:', JSON.stringify(filterReqs.slice(0, 8), null, 1).slice(0, 1800));
  await page.screenshot({ path: path.join(OUT, '10-filter-applied.png') });

  // 4. 从捕获请求学参数后，直接 fetch 特斯拉-only 三分类 total
  console.log('[3] 特斯拉-only 三分类 total ...');
  const lastList = captured.filter((c) => /user\/list/.test(c.u)).pop();
  let teslaParam = null;
  if (lastList) {
    try {
      const body = JSON.parse(lastList.req);
      for (const k of Object.keys(body)) {
        if (/belong|account|user/i.test(k) && k !== 'userTagIds') teslaParam = { key: k, value: body[k] };
      }
    } catch {}
  }
  console.log('  疑似参数:', JSON.stringify(teslaParam));
  const teslaTotals = await page.evaluate(async ({ tp }) => {
    const post = async (p, body) => {
      const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/' + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const out = {};
    for (const ev of [1, 2, 3]) {
      const base = { startTime: '2026-09-24', endTime: '2026-09-30', clueEventTypeList: [ev], pageNum: 1, pageSize: 1 };
      if (tp) base[tp.key] = tp.value;
      const j = await post('user/list', base);
      out['ev' + ev] = j?.data?.cluePageInfo ?? null;
    }
    // statistic 是否吃账号参数
    const st = { startTime: '2026-09-24', endTime: '2026-09-30', sysTagIds: ['2', '3', '4', '11', '12'], userTagIds: [] };
    if (tp) st[tp.key] = tp.value;
    const s = await post('user/statistic', st);
    out.statisticFiltered = s?.data ?? null;
    return out;
  }, { tp: teslaParam });
  fs.writeFileSync(path.join(OUT, 'probe4-tesla-totals.json'), JSON.stringify(teslaTotals, null, 1), 'utf8');
  console.log('  官号-only:', JSON.stringify(teslaTotals, null, 1).slice(0, 1200));

  // 5. 线索视图 API（找广告/自然字段）
  console.log('[4] 线索视图 ...');
  captured.length = 0;
  await page.locator('span:text-is("线索视图"), div:text-is("线索视图")').locator('visible=true').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(6000);
  const clueViewReqs = captured.map((c) => ({ u: c.u.split('/').pop(), req: c.req.slice(0, 900), resHead: c.res.slice(0, 3000) }));
  fs.writeFileSync(path.join(OUT, 'probe4-clue-view.json'), JSON.stringify(clueViewReqs, null, 1), 'utf8');
  console.log('  线索视图请求:', JSON.stringify(clueViewReqs.map((c) => ({ u: c.u, req: c.req.slice(0, 400) })), null, 1).slice(0, 1500));

  // 6. pageSize=1000 可行性 + 全行数页数估算
  console.log('[5] pageSize=1000 ...');
  const big = await page.evaluate(async () => {
    const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/user/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ startTime: '2026-09-24', endTime: '2026-09-30', clueEventTypeList: [1], pageNum: 1, pageSize: 1000 }),
    });
    const j = await r.json().catch(() => null);
    return { rows: j?.data?.userList?.length ?? 0, pageInfo: j?.data?.cluePageInfo ?? null, code: j?.code };
  });
  console.log('  pageSize=1000:', JSON.stringify(big));

  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
