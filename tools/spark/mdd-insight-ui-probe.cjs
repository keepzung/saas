#!/usr/bin/env node
// 生产 UI 探针：种草转化分析页 Tab 切换/看笔记弹窗/笔记链接可达性
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'noop.js'));
const pc = backendRequire('playwright-core');
const findChromium = () => {
  const bases = ['/root/.cache/ms-playwright', '/home/deploy/.cache/ms-playwright', path.join(process.env.HOME ?? '', '.cache', 'ms-playwright'), process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
      const exe = path.join(base, d, sub);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
};
const chromium = { launch: (opts) => pc.chromium.launch({ ...opts, executablePath: findChromium() ?? undefined }) };
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto('https://marketineok.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[placeholder="请输入账号"]', '18510234580');
  await page.fill('input[placeholder="请输入密码"]', 'Marketine@2026');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(3000);
  await page.locator('.company-card', { hasText: 'Morgandada' }).first().click();
  await page.waitForTimeout(600);
  await page.click('.action-confirm').catch(() => {});
  await page.waitForTimeout(2500);
  await page.goto('https://marketineok.com/kox_df/sales/category-insight', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const t1 = await page.evaluate(() => ({
    segs: [...document.querySelectorAll('.ant-segmented-item')].map((x) => x.textContent),
    hasKosTable: document.body.innerText.includes('KOS 账号'),
  }));
  ok('页面加载+五 Tab', t1.segs.length === 5 && t1.hasKosTable, JSON.stringify(t1.segs));

  // 切品类供需 → 看笔记弹窗
  await page.evaluate(() => [...document.querySelectorAll('.ant-segmented-item')].find((x) => x.textContent.includes('品类供需'))?.click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('看笔记'))?.click());
  await page.waitForTimeout(1000);
  const t2 = await page.evaluate(() => ({
    modal: !!document.querySelector('.ant-modal:not([style*="display: none"])'),
    title: document.querySelector('.ant-modal-title')?.textContent ?? null,
    linkCount: document.querySelectorAll('.ant-modal a[target="_blank"]').length,
    firstHref: document.querySelector('.ant-modal a[target="_blank"]')?.getAttribute('href') ?? null,
  }));
  ok('看笔记弹窗', t2.modal && t2.linkCount > 0, `links=${t2.linkCount}`);
  const firstLink = t2.firstHref;
  // 关弹窗
  await page.evaluate(() => document.querySelector('.ant-modal .ant-modal-close')?.click());
  await page.waitForTimeout(500);

  // 切内容类型
  await page.evaluate(() => [...document.querySelectorAll('.ant-segmented-item')].find((x) => x.textContent.includes('内容类型'))?.click());
  await page.waitForTimeout(1500);
  const t3 = await page.evaluate(() => ({
    canvas: document.querySelectorAll('canvas').length,
    table: document.body.innerText.includes('类型明细'),
  }));
  ok('内容类型 Tab', t3.canvas > 0 && t3.table, JSON.stringify(t3));

  // 切口径维护
  await page.evaluate(() => [...document.querySelectorAll('.ant-segmented-item')].find((x) => x.textContent.includes('口径维护'))?.click());
  await page.waitForTimeout(1500);
  const t4 = await page.evaluate(() => document.body.innerText.includes('品类定义') && document.body.innerText.includes('映射规则'));
  ok('口径维护 Tab', t4);

  // 笔记链接可达性（新页打开生产库里第一条看笔记链接）
  if (firstLink) {
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const resp = await p2.goto(firstLink, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(3000);
    const t5 = {
      status: resp?.status() ?? null,
      finalUrl: p2.url().slice(0, 90),
      bodyHint: (await p2.evaluate(() => document.body?.innerText?.slice(0, 200) || '')).replace(/\n/g, ' '),
    };
    const dead = /无法浏览|不存在|审核|验证|login|passport|异常/i.test(t5.bodyHint);
    ok('笔记链接可达', !dead && t5.status === 200, `status=${t5.status} url=${t5.finalUrl} 提示=${t5.bodyHint.slice(0, 80)}`);
    await p2.close();
  }

  ok('zero pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('INSIGHT PROBE DONE');
})().catch((e) => { console.error('probe error:', String(e).slice(0, 300)); process.exitCode = 1; });
