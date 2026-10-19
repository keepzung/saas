#!/usr/bin/env node
// 探针(一次性): brand5 星火MCC →「进入专业号」SSO 跳转 → pro.xiaohongshu.com 线索接口验证
// 品牌安全: 全程仅用 SparkOrgConfig brandId=5 的 MCC cookie；落地后页面文本必须含 MorganDaDa 且不含特斯拉，否则立即失败
// 用法: PLAYWRIGHT_BROWSERS_PATH=/home/deploy/.cache/ms-playwright node probe-mcc-jump-pro.cjs
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BACKEND_DIR = process.env.BACKEND_DIR || '/opt/saas/backend';
const req = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

const BRAND_ID = Number(process.env.BRAND_ID || 5);
const EXPECT_NAME = BRAND_ID === 5 ? 'morgandada' : BRAND_ID === 6 ? '特斯拉' : '';
const FORBIDDEN = BRAND_ID === 5 ? ['特斯拉'] : [];

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  chromium = req('playwright-core').chromium;
}

const SH = 8 * 3600_000;
const dayStr = (d) => new Date(d.getTime() + SH).toISOString().slice(0, 10);
const yesterday = dayStr(new Date(Date.now() - 86400_000));

function parseCookieStr(str) {
  return str
    .split(/;\s*/)
    .map((p) => {
      const i = p.indexOf('=');
      if (i < 0) return null;
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    })
    .filter(Boolean);
}

(async () => {
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  if (!cfg?.cookie) throw new Error(`SparkOrgConfig brandId=${BRAND_ID} 无 cookie`);
  console.log('[1] MCC orgCode=', cfg.orgCode, 'cookieLen=', cfg.cookie.length);

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1600, height: 1000 },
  });
  // MCC cookie 注入 .xiaohongshu.com 域（含子域 mcc.*）
  await ctx.addCookies(
    parseCookieStr(cfg.cookie).map((c) => ({
      ...c,
      domain: '.xiaohongshu.com',
      path: '/',
    })),
  );
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!/mcc\.xiaohongshu\.com\/api\/|vision|pro[-_]data|ticket|sso|jump/i.test(url)) return;
      if (/spider-tracker|apm|collect|abtest/.test(url)) return;
      const body = (await res.text().catch(() => '')).slice(0, 300);
      apiLog.push({ url: url.slice(0, 160), status: res.status(), body });
    } catch { /* ignore */ }
  });

  // [2] MCC 经营分析→专业号页
  await page.goto('https://mcc.xiaohongshu.com/micro/pro-data', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  const mccText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 1500);
  console.log('[2] MCC pro-data 页 URL=', page.url());
  console.log('[2] 页面含 MorganDaDa:', /morgandada/i.test(mccText), '含特斯拉:', /特斯拉/.test(mccText));
  console.log('[2] 文本摘要:', mccText.replace(/\s+/g, ' ').slice(0, 300));
  if (!/morgandada/i.test(mccText) || FORBIDDEN.some((f) => mccText.includes(f))) {
    await page.screenshot({ path: '/tmp/jump-mcc-fail.png', fullPage: true }).catch(() => {});
    throw new Error('MCC 页面品牌校验失败（非 MorganDaDa 或含特斯拉），终止');
  }

  // [3] 定位「进入专业号」元素：dump 结构后点击（可能是带 ticket 的 <a>），轮询 URL/新 tab
  const els = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll('a, button, span, div')) {
      const t = (el.textContent || '').trim();
      if (t === '进入专业号' && el.children.length <= 1) {
        hits.push({
          tag: el.tagName,
          href: el.getAttribute('href') || (el.closest('a')?.getAttribute('href') ?? null),
          outer: el.outerHTML.slice(0, 220),
        });
      }
    }
    return hits;
  });
  console.log('[3] 进入专业号 元素:', JSON.stringify(els, null, 1));
  const jumpHref = els.find((e) => e.href)?.href || null;

  const pollUrl = async (p, ms) => {
    const seen = [];
    for (let t = 0; t < ms; t += 1000) {
      const u = p.url();
      if (!seen.length || seen[seen.length - 1] !== u) seen.push(u);
      await page.waitForTimeout(1000).catch(() => {});
    }
    return seen;
  };

  let popup = null;
  const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).then((p) => (popup = p)).catch(() => null);
  if (jumpHref) {
    console.log('[3] 直接导航 href=', jumpHref.slice(0, 180));
    await page.goto(jumpHref, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  } else {
    // 拦截 window.open 抓 SSO 目标地址，再用原生 click 触发处理器
    await page.evaluate(() => {
      window.__opened = [];
      const orig = window.open;
      window.open = function (...args) {
        window.__opened.push(args.map((a) => String(a)));
        try {
          return orig.apply(window, args);
        } catch {
          return null;
        }
      };
    });
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a, button, span, div')].find(
        (e) => (e.textContent || '').trim() === '进入专业号' && e.children.length <= 1,
      );
      if (el) el.click();
      return Boolean(el);
    });
    await page.waitForTimeout(8000);
    const opened = await page.evaluate(() => window.__opened || []);
    console.log('[3] window.open 捕获:', JSON.stringify(opened));
    const ssoUrl = opened[0]?.[0] || null;
    if (ssoUrl) {
      console.log('[3] 导航 SSO 地址:', ssoUrl.slice(0, 200));
      await page.goto(ssoUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('[3] sso goto 异常:', String(e).slice(0, 120)));
    }
  }
  const urls = await pollUrl(page, 12000);
  await popupPromise;
  console.log('[3] URL 轨迹:', JSON.stringify(urls));
  let pro = popup || page;
  if (popup) console.log('[3] 新 tab URL=', popup.url());
  await pro.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await pro.waitForTimeout(8000);
  console.log('[3] 最终 URL=', pro.url());
  if (!/pro\.xiaohongshu\.com/.test(pro.url())) {
    // 未跳转成功：直接访问专业号平台看登录态
    await pro.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management?tabsKey=userList', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await pro.waitForTimeout(6000);
    console.log('[3b] 直访线索页 URL=', pro.url());
  }
  const proText = (await pro.evaluate(() => document.body?.innerText || '')).slice(0, 2000);
  console.log('[4] 专业号页含 MorganDaDa:', /morgandada/i.test(proText), '含特斯拉:', /特斯拉/.test(proText), '疑似登录页:', /login|passport/i.test(pro.url()));
  console.log('[4] 文本摘要:', proText.replace(/\s+/g, ' ').slice(0, 300));
  if (!/morgandada/i.test(proText) || FORBIDDEN.some((f) => proText.includes(f))) {
    await pro.screenshot({ path: '/tmp/jump-pro-fail.png', fullPage: true }).catch(() => {});
    throw new Error('专业号落地页品牌校验失败，终止');
  }

  // [5] 页面上下文调线索接口（与 sync-pro-clues 同参数）
  const clue = await pro.evaluate(async ({ day }) => {
    const post = async (p, body) => {
      const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/' + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const list = await post('user/list', { startTime: day, endTime: day, clueEventTypeList: [1], pageNum: 1, pageSize: 5 });
    const rows = (list?.data?.userList ?? []).slice(0, 3).map((x) => ({
      customerUserId: x.customerUserId,
      belongUserId: x.belongUserId ?? null,
      belongUserName: x.belongUserName ?? null,
      sysTag: x.sysTag ?? null,
    }));
    const st = await post('user/statistic', { startTime: day, endTime: day, sysTagIds: ['2', '3', '4', '11', '12'], userTagIds: [] });
    return {
      listCode: list?.code, listTotal: list?.data?.cluePageInfo?.total ?? null, rows,
      stCode: st?.code, tags: st?.data?.tagStatList ?? null,
    };
  }, { day: yesterday });
  console.log('[5] clue user/list code=', clue.listCode, 'total=', clue.listTotal);
  console.log('[5] 样本行:', JSON.stringify(clue.rows));
  console.log('[5] statistic code=', clue.stCode, 'tags=', JSON.stringify(clue.tags));

  // [6] 导出落地后的专业号 cookie（供持久化为 ProOrgConfig storageState 参考）
  const cookies = await ctx.cookies(['https://pro.xiaohongshu.com']);
  console.log('[6] pro cookies:', cookies.map((c) => c.name).join(','), 'count=', cookies.length);
  fs.writeFileSync('/tmp/pro-state-derived.json', JSON.stringify({ cookies, origin: 'https://pro.xiaohongshu.com' }), 'utf8');
  console.log('[6] 已写 /tmp/pro-state-derived.json');

  console.log('--- MCC api 捕获（前 6 条）---');
  for (const a of apiLog.slice(0, 6)) console.log(' ', a.status, a.url, a.body.slice(0, 120));
  await browser.close();
  console.log('PROBE DONE');
  await prisma.$disconnect();
})().catch((e) => {
  console.error('PROBE FAIL:', String(e).slice(0, 400));
  process.exit(1);
});
