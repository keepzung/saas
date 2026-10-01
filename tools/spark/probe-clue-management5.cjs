#!/usr/bin/env node
// 线索经营探针第 5 轮：精确 scoping 归属账号下拉 + 官号行占比(pageSize 1000 客户端过滤) + 线索视图
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
    captured.push({ u: u.slice(0, 160), req: res.request().postData() || '', res: body.slice(0, 300000) });
  });

  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(9000);

  // ── A. 官号行占比：直接 fetch ev1 全量第一页 1000 行，统计归属账号分布 ──
  console.log('[A] ev1 前 1000 行归属账号分布 ...');
  const dist = await page.evaluate(async () => {
    const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/user/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ startTime: '2026-09-24', endTime: '2026-09-30', clueEventTypeList: [1], pageNum: 1, pageSize: 1000 }),
    });
    const j = await r.json().catch(() => null);
    const rows = j?.data?.userList ?? [];
    const byAcc = {};
    for (const x of rows) {
      const k = x.belongUserName || '?';
      byAcc[k] = (byAcc[k] ?? 0) + 1;
    }
    const tesla = rows.filter((x) => x.belongUserId === '5cad9d230000000011005d41').length;
    return { rows: rows.length, teslaRows: tesla, dist: Object.fromEntries(Object.entries(byAcc).sort((a, b) => b[1] - a[1]).slice(0, 15)) };
  });
  console.log('  ', JSON.stringify(dist, null, 1).slice(0, 1500));

  // ── B. 归属账号下拉（精确 scoping 到「归属账号」表单项）──
  console.log('[B] 归属账号下拉（精确 scoping）...');
  await page.locator('span:text-is("筛选")').locator('visible=true').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(1500);
  const item = page.locator('.d-new-form-item:has(.d-text:text-is("归属账号")) .d-select-wrapper').first();
  const cnt = await item.count().catch(() => 0);
  console.log('  控件数量:', cnt);
  if (cnt) {
    await item.click({ timeout: 4000 }).catch(() => {});
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, '11-dropdown2.png') });
    const optDump = await page.evaluate(() => {
      const els = [...document.querySelectorAll('body *')].filter((e) => {
        const t = (e.textContent || '').trim();
        return /特斯拉/.test(t) && /杭州萧山|全国|分身|中心/.test(t) && e.offsetParent !== null && e.querySelectorAll('*').length < 400 && t.length < 2000;
      });
      const el = els.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
      return el ? { cls: String(el.className).slice(0, 120), text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 300) } : null;
    });
    console.log('  选项容器:', JSON.stringify(optDump));
    // 用坐标点击「特斯拉」精确项
    const picked = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('[class*=option], [class*=item], li, [class*=menu] [class*=row]')].filter((e) => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return e.offsetParent !== null && /^特斯拉(ID|\s*ID|$)/.test(t) && t.length < 50;
      });
      const el = opts[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    console.log('  精确「特斯拉」项:', JSON.stringify(picked));
    if (picked) {
      await page.mouse.click(picked.x, picked.y);
      await sleep(1200);
      // 关闭下拉 + 应用
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(500);
      for (const t of ['查 询', '查询', '确 定', '确定']) {
        const b = page.locator(`button:has-text("${t}")`).locator('visible=true').last();
        if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); break; }
      }
      await sleep(6000);
      const reqs = captured.filter((c) => /user\/list/.test(c.u)).map((c) => c.req.slice(0, 700));
      fs.writeFileSync(path.join(OUT, 'probe5-filter-req.json'), JSON.stringify(reqs, null, 1), 'utf8');
      console.log('  筛选后 list 请求:', JSON.stringify(reqs.slice(-2), null, 1).slice(0, 1200));
      await page.screenshot({ path: path.join(OUT, '12-filter-applied2.png') });
    }
  }

  // ── C. 线索视图 ──
  console.log('[C] 线索视图 ...');
  captured.length = 0;
  const tabs = page.locator('[class*=tab]:has-text("线索视图"), span:text-is("线索视图")');
  const tcnt = await tabs.count().catch(() => 0);
  console.log('  tab 候选:', tcnt);
  if (tcnt) {
    await tabs.first().click({ timeout: 4000 }).catch(() => {});
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, '13-clue-view2.png') });
    const reqs = captured.map((c) => ({ u: c.u.split('/').pop(), req: c.req.slice(0, 900), resHead: c.res.slice(0, 2500) }));
    fs.writeFileSync(path.join(OUT, 'probe5-clue-view.json'), JSON.stringify(reqs, null, 1), 'utf8');
    console.log('  请求:', JSON.stringify(reqs.map((c) => ({ u: c.u, req: c.req.slice(0, 350) })), null, 1).slice(0, 1400));
  }

  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
