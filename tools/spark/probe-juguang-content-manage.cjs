#!/usr/bin/env node
// 商业内容管理探针：partner → 跳「特斯拉KOS项目-基础」聚光 → 创意→商业内容管理 → 抓列表 API（标题/封面/笔记结构）
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
const TARGET = '特斯拉KOS项目-基础';
const OUT = path.join(__dirname, 'state', 'juguang-content');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: 6 } });
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  if (cfg?.cookie) {
    await ctx.addCookies(cfg.cookie.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
  }
  const listPage = await ctx.newPage();
  await listPage.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  if (/login/i.test(listPage.url())) { console.log('partner 会话失效（先 node /tmp/tp6.cjs 刷新）'); await browser.close(); process.exit(1); }
  await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(10000);
  await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = listPage.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);
  const rowsLoc = listPage.locator('tbody tr');
  let idx = -1;
  for (let i = 0; i < (await rowsLoc.count()); i++) {
    if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(TARGET)) { idx = i; break; }
  }
  if (idx < 0) { console.log('未找到目标行'); await browser.close(); process.exit(1); }
  let popup = null;
  for (let attempt = 1; attempt <= 3 && !popup; attempt++) {
    const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
    await rowsLoc.nth(idx).locator('text=跳转').first().click({ timeout: 8000 }).catch(() => {});
    await sleep(3500);
    popup = await popupPromise;
    if (!popup) {
      await rowsLoc.nth(idx).locator('text=跳转').first().hover({ timeout: 4000 }).catch(() => {});
      await sleep(1500);
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
    if (popup) {
      for (let i = 0; i < 10; i++) {
        if (/vSellerId=[0-9a-f]/.test(popup.url())) break;
        await sleep(1500);
      }
      if (/vSellerId=[0-9a-f]/.test(popup.url())) break;
      console.log(`[${attempt}] popup 落地异常: ${popup.url().slice(0, 80)}`);
      await popup.close().catch(() => {});
      popup = null;
    }
    if (attempt < 3) {
      console.log(`[${attempt}] 跳转失败，冷却 20s 重试`);
      await sleep(20000);
      await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(9000);
      await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
      idx = -1;
      for (let i = 0; i < (await rowsLoc.count()); i++) {
        if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(TARGET)) { idx = i; break; }
      }
      if (idx < 0) { console.log('重试时未找到目标行'); await browser.close(); process.exit(1); }
    }
  }
  if (!popup) { console.log('未进入聚光'); await browser.close(); process.exit(1); }
  const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? '';
  console.log('[1] vSellerId=', vseller);
  // 捕获 API
  const apis = [];
  popup.on('response', async (res) => {
    const u = res.url();
    if (!/ad\.xiaohongshu\.com\/api\//.test(u)) return;
    let body = '';
    try { body = (await res.text()).slice(0, 60000); } catch {}
    apis.push({ u: u.slice(0, 200), req: (res.request().postData() || '').slice(0, 2000), res: body });
  });

  // 进商业内容管理：先试已知路由猜测，再页面点击兜底
  console.log('[2] 打开 创意→商业内容管理 ...');
  const candidates = [
    `https://ad.xiaohongshu.com/aurora/ad/creative/content-manage?vSellerId=${vseller}`,
    `https://ad.xiaohongshu.com/aurora/ad/creative/business-content?vSellerId=${vseller}`,
    `https://ad.xiaohongshu.com/aurora/ad/content-manage/note?vSellerId=${vseller}`,
  ];
  let landed = '';
  for (const u of candidates) {
    await popup.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(9000);
    const info = await popup.evaluate(() => ({ url: location.href.slice(0, 140), text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160) }));
    console.log('  try:', JSON.stringify(info));
    if (/商业内容|笔记管理/.test(info.text)) { landed = info.url; break; }
  }
  if (!landed) {
    console.log('  路由猜测失败，展开侧边栏「创意管理」后搜索 ...');
    await popup.goto(`https://ad.xiaohongshu.com/microapp/creativity/inspire?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(8000);
    await popup.locator('text=创意管理').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(2000);
    const cands = await popup.evaluate(() => {
      const out = [];
      const walk = (el) => {
        for (const c of el.children ?? []) walk(c);
        const t = (el.textContent || '').trim();
        if (t === '商业内容管理' && el.offsetParent !== null) {
          const r = el.getBoundingClientRect();
          out.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), href: el.getAttribute('href') || '', x: r.x, y: r.y });
        }
      };
      walk(document.body);
      return out.slice(0, 10);
    });
    console.log('  候选:', JSON.stringify(cands));
    fs.writeFileSync(path.join(OUT, 'menu-candidates.json'), JSON.stringify(cands, null, 1), 'utf8');
    const withHref = cands.find((c) => c.href);
    if (withHref) {
      const href = withHref.href.startsWith('http') ? withHref.href : `https://ad.xiaohongshu.com${withHref.href}`;
      await popup.goto(href.includes('?') ? `${href}&vSellerId=${vseller}` : `${href}?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    } else if (cands.length) {
      await popup.mouse.click(cands[0].x + 10, cands[0].y + 8).catch(() => {});
    }
    await sleep(10000);
    landed = popup.url().slice(0, 140);
    console.log('  落地:', landed);
  }
  await popup.screenshot({ path: path.join(OUT, 'content-manage.png') });
  const pageText = await popup.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 900));
  fs.writeFileSync(path.join(OUT, 'page-text.txt'), pageText, 'utf8');
  console.log('[3] 页面文本:', JSON.stringify(pageText.slice(0, 400)));

  fs.writeFileSync(path.join(OUT, 'apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  const interesting = apis.filter((a) => /note|content|list|page/i.test(a.u));
  for (const a of interesting.slice(0, 6)) {
    console.log('---', a.u.slice(0, 110));
    console.log('  REQ:', a.req.slice(0, 320));
    console.log('  RES:', a.res.replace(/\s+/g, ' ').slice(0, 320));
  }
  console.log(`[out] apis=${apis.length} → ${OUT}`);
  await browser.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
