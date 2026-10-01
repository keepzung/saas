#!/usr/bin/env node
// 线索经营探针第 3 轮：筛选面板 DOM dump → 归属账号正确选中 → 官号-only total → 线索视图
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

  // 1. 打开筛选面板，dump HTML
  console.log('[1] 打开筛选面板 dump DOM ...');
  await page.locator('button:has-text("筛选"), [class*=btn]:has-text("筛选"), span:text-is("筛选")').locator('visible=true').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(2000);
  // 找包含「归属账号」的弹层/面板
  const panelHtml = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div')].filter((d) => {
      const t = d.innerText || '';
      return t.includes('归属账号') && t.length < 6000 && d.querySelector('input, select, [class*=select], [class*=picker]');
    });
    const el = cands.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    return el ? el.outerHTML.slice(0, 60000) : 'NOT_FOUND';
  });
  fs.writeFileSync(path.join(OUT, 'filter-panel.html'), panelHtml, 'utf8');
  console.log('  panel html 长度:', panelHtml.length, panelHtml === 'NOT_FOUND' ? '(未找到)' : '');

  // 2. 归属账号下拉：在面板内找 select/自定义下拉
  console.log('[2] 归属账号下拉交互 ...');
  captured.length = 0;
  const selInfo = await page.evaluate(() => {
    // 找文本「归属账号」所在表单项
    const labels = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim() === '归属账号');
    for (const lb of labels) {
      let p = lb.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        const sel = p.querySelector('select, [class*=select], [class*=cascader], [class*=picker], [class*=dropdown]');
        if (sel) return { tag: sel.tagName, cls: String(sel.className).slice(0, 120), html: sel.outerHTML.slice(0, 800) };
        p = p.parentElement;
      }
    }
    return null;
  });
  console.log('  归属账号控件:', JSON.stringify(selInfo)?.slice(0, 500));
  if (selInfo) fs.writeFileSync(path.join(OUT, 'account-select.html'), selInfo.html, 'utf8');

  // 尝试点击该控件展开
  if (selInfo) {
    const box = page.locator(`${selInfo.tag.toLowerCase()}${selInfo.cls ? '.' + selInfo.cls.trim().split(/\s+/).slice(0, 2).join('.') : ''}`).first();
    await box.click({ timeout: 4000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '08-account-options.png') });
    // 弹层选项通常挂在 body 下
    const optInfo = await page.evaluate(() => {
      const pops = [...document.querySelectorAll('[class*=popper], [class*=dropdown], [class*=options], [class*=menu], ul')].filter((e) => {
        const t = e.innerText || '';
        return /特斯拉/.test(t) && /杭州|上海|全国|中心|分身|体验/.test(t) && e.offsetParent !== null;
      });
      const el = pops.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
      return el ? { cls: String(el.className).slice(0, 100), text: (el.innerText || '').slice(0, 400), html: el.outerHTML.slice(0, 3000) } : null;
    });
    console.log('  弹层选项:', optInfo ? JSON.stringify(optInfo.text).slice(0, 300) : 'null');
    if (optInfo) fs.writeFileSync(path.join(OUT, 'account-options.html'), optInfo.html, 'utf8');
  }
  await browser.close();
  console.log('[done] dump 完成，待人工确认控件结构后再写自动选中逻辑');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
