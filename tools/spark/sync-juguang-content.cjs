#!/usr/bin/env node
// 商业内容管理同步器（brandId=6）：partner → 只跳「特斯拉KOS项目-基础」聚光 → 创意→创意管理→商业内容管理
// API: POST /api/leona/creative_center/noteList  {brandUserId, noteType:0, pageNum, pageSize, noteDataStartTime/EndTime}
// 行字段：noteTitle/noteId/noteLink/notePublishTime(真实)/noteImageUrl(封面)/authorName/isRtbAdver/noteData{impNum,readFeedNum,engageCnt,...}
// 用途：KoxNote 回填真实标题/封面/发布时间/作者/链接（占位与空值优先，不覆盖已有真实值）
// 用法: node sync-juguang-content.cjs [--dry-run]   HEADLESS=0 人工辅助
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
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

const BRAND_ID = 6;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TARGET = process.env.JG_TARGET || '特斯拉KOS项目-基础';
const STATE_FILE = path.join(__dirname, 'state', 'partner-state-latest.json');
// 与 sync-juguang.cjs 一致：加载 backend/.env（PARTNER_LOGIN_USER/PASS 自动重登用）
const envPath = path.join(__dirname, '../../backend/.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const PLACEHOLDER_TITLES = new Set(['(乐允投放笔记)', '(聚光投放笔记)', '(无标题)']);
const PAGE_SIZE = Number(process.env.JG_PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.JG_MAX_PAGES || 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const mkCtx = async (cookieStr) => {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
    if (cookieStr) {
      await ctx.addCookies(cookieStr.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
    }
    return ctx;
  };
  const loginPartner = async (ctx2) => {
    const page = await ctx2.newPage();
    await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);
    if (!/login|signin/i.test(page.url())) return { ok: true, page };
    console.log('[login] partner 会话失效，账密自动重登 ...');
    const ACCOUNT = process.env.PARTNER_LOGIN_USER;
    const PASSWORD = process.env.PARTNER_LOGIN_PASS;
    if (!ACCOUNT || !PASSWORD) { console.log('[login] 缺 PARTNER_LOGIN_USER/PASS'); return { ok: false, page }; }
    try {
      const tab = page.locator('text=/账号登录/').first();
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); await sleep(600); }
      await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').first().fill(ACCOUNT, { timeout: 8000 });
      await page.locator('input[type="password"]').first().fill(PASSWORD, { timeout: 8000 });
      await sleep(300);
      await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
    } catch (e) {
      console.log('[login] 自动填充失败（可能滑块）:', String(e).slice(0, 80));
    }
    for (let i = 0; i < 200; i++) {
      await sleep(3000);
      if (!/login|signin/i.test(page.url())) {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(await ctx2.storageState()), 'utf8');
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const cookieStr = (state.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
        if (cookieStr) await prisma.sparkOrgConfig.update({ where: { brandId: BRAND_ID }, data: { cookie: cookieStr } });
        console.log('[login] 重登成功，cookie 已热更 DB');
        return { ok: true, page };
      }
      if (i % 8 === 7) console.log('[login] 等待登录中...');
    }
    return { ok: false, page };
  };

  let ctx = await mkCtx(cfg?.cookie);
  let lp = await loginPartner(ctx);
  if (!lp.ok && fs.existsSync(STATE_FILE)) {
    await ctx.close().catch(() => {});
    ctx = await browser.newContext({ storageState: STATE_FILE, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
    lp = await loginPartner(ctx);
  }
  if (!lp.ok) { console.error('partner 会话不可用：HEADLESS=0 人工登录一次后重跑'); await browser.close(); process.exit(1); }
  const listPage = lp.page;
  // 平台跳转可能弹 confirm（Playwright 默认 dismiss 会取消跳转）：所有页面统一自动接受
  const dialogAccept = (pg) => pg.on('dialog', (d) => d.accept().catch(() => {}));
  dialogAccept(listPage);
  ctx.on('page', (pg) => dialogAccept(pg));
  await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(10000);
  await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = listPage.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);
  const rowsLoc = listPage.locator('tbody tr');

  // ── stat-daily 模式：12 子账户×逐日「商业内容管理」合计行（运营总览内容指标权威口径）──
  if (process.argv.includes('--stat-daily')) {
    const sIdx = process.argv.indexOf('--start');
    const eIdx = process.argv.indexOf('--end');
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const sEnd = eIdx > -1 ? process.argv[eIdx + 1] : new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const sStart = sIdx > -1 ? process.argv[sIdx + 1] : new Date(new Date(`${sEnd}T00:00:00Z`).getTime() - 29 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const statDays = [];
    for (let d = sStart, g = 0; d <= sEnd && g++ < 200; d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86400000 + 8 * 3600000).toISOString().slice(0, 10)) statDays.push(d);
    // 发布窗口：只采集「窗口内发布的员工笔记」的逐日表现（区域数据分析时段发布口径）
    // 回填显式传 --pub-start/--pub-end；缺省=滚动近 PUB_WINDOW_DAYS 天（每日 cron 用）
    const pubStartIdx = process.argv.indexOf('--pub-start');
    const pubEndIdx = process.argv.indexOf('--pub-end');
    const PUB_DAYS = Number(process.env.PUB_WINDOW_DAYS || 35);
    const pubStart = pubStartIdx > -1 ? process.argv[pubStartIdx + 1] : new Date(new Date(`${sEnd}T00:00:00Z`).getTime() - (PUB_DAYS - 1) * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const pubEnd = pubEndIdx > -1 ? process.argv[pubEndIdx + 1] : sEnd;
    console.log(`[stat-daily] 区间 ${sStart} ~ ${sEnd}（${statDays.length} 天）；发布窗口 ${pubStart} ~ ${pubEnd}`);
    const F = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.round(n) : 0; };
    const parsePubS = (s) => {
      if (!s) return null;
      const d = new Date(String(s).replace(' ', 'T') + '+08:00');
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const enumerateAll = async () => {
      const out = [];
      for (let pg2 = 0; pg2 < 6; pg2++) {
        const rc = await rowsLoc.count();
        for (let i = 0; i < rc; i++) {
          const txt = (await rowsLoc.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ');
          const idm = txt.match(/([0-9a-f]{24})/);
          if (idm && /特斯拉/.test(txt) && !/官号/.test(txt)) out.push({ name: txt.split(' ')[0].slice(0, 30), id: idm[1], status: /冻结/.test(txt) ? 'frozen' : 'active' });
        }
        const nextBtn = listPage.locator('[class*=pagination] [class*=next], li[class*=next], button[class*=next]').locator('visible=true').first();
        if (!(await nextBtn.count())) break;
        const disabled = await nextBtn.evaluate((el) => el.className.includes('disabled') || el.getAttribute('disabled') !== null).catch(() => true);
        if (disabled) break;
        await nextBtn.click({ timeout: 5000 }).catch(() => {});
        await sleep(5000);
      }
      const seen = new Set();
      return out.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    };
    const backToList = async () => {
      await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(9000);
      await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
    };

    const accounts = await enumerateAll();
await backToList();
    console.log(`[stat-daily] 子账户 ${accounts.length} 个（active ${accounts.filter((a) => a.status === 'active').length}）`);
    const upserts = [];
    let okAcc = 0;
    for (const acc of accounts.filter((a) => a.status === 'active')) {
      // 跳转子账户聚光（与 sync-juguang.cjs ensureJump 同款：popup → 同页兜底 → hover「聚光平台」菜单兜底）
      let popup2 = null;
      for (let attempt = 1; attempt <= 3 && !popup2; attempt++) {
        let rowIdx = -1;
        for (let pg2 = 0; pg2 < 6 && rowIdx < 0; pg2++) {
          const rc = await rowsLoc.count();
          for (let i = 0; i < rc; i++) {
            if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(acc.id)) { rowIdx = i; break; }
          }
          if (rowIdx < 0) {
            const nextBtn = listPage.locator('[class*=pagination] [class*=next], li[class*=next], button[class*=next]').locator('visible=true').first();
            const disabled = await nextBtn.evaluate((el) => el.className.includes('disabled') || el.getAttribute('disabled') !== null).catch(() => true);
            if (disabled || !(await nextBtn.count())) break;
            await nextBtn.click({ timeout: 5000 }).catch(() => {});
            await sleep(5000);
          }
        }
        if (rowIdx < 0) { console.log(`[${acc.name}] 列表中未找到，跳过`); break; }
        const rowJump = rowsLoc.nth(rowIdx).locator('text=跳转').first();
        const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
        await rowJump.click({ timeout: 8000 }).catch(() => {});
        await sleep(3500);
        popup2 = await popupPromise;
        // 同页兜底：跳转不弹新窗、当前页直接进聚光——新开页复用会话并立即恢复子账户列表
        if (!popup2) {
          for (let i = 0; i < 8; i++) {
            if (/vSellerId=|ad\.xiaohongshu\.com/.test(listPage.url())) break;
            await sleep(1500);
          }
          if (/vSellerId=|ad\.xiaohongshu\.com/.test(listPage.url())) {
            const landed = listPage.url();
            popup2 = await ctx.newPage();
            await popup2.goto(landed, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            await sleep(6000);
            listPage
              .goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 })
              .catch(() => {});
            await sleep(9000);
            await listPage.evaluate(() => document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove())).catch(() => {});
          }
        }
        // hover 兜底：行内悬浮「聚光平台」菜单项
        if (!popup2) {
          await rowJump.hover({ timeout: 4000 }).catch(() => {});
          await sleep(1200);
          const picks = listPage.locator('text="聚光平台"');
          for (let i = 0; i < (await picks.count()); i++) {
            if (await picks.nth(i).isVisible().catch(() => false)) {
              const pp2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
              await picks.nth(i).click({ timeout: 6000 }).catch(() => {});
              popup2 = await pp2;
              break;
            }
          }
        }
        if (popup2) {
          // 等 SSO 链路完成：URL 到聚光域且加载稳定（中断会丢账户会话）
          for (let i = 0; i < 12; i++) {
            if (/vSellerId=|ad\.xiaohongshu\.com/.test(popup2.url())) break;
            await sleep(1500);
          }
          if (/vSellerId=|ad\.xiaohongshu\.com/.test(popup2.url())) {
            await popup2.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
            await sleep(6000);
            break;
          }
          console.log(`[${acc.name}] popup 落地异常: ${popup2.url().slice(0, 90)}`);
          await popup2.close().catch(() => {});
          popup2 = null;
        }
        if (attempt < 3) {
          console.log(`[${acc.name}] 第 ${attempt} 次跳转失败，20s 后重试 ...`);
          await sleep(20000);
          await backToList();
        }
      }
      if (!popup2) { console.log(`[${acc.name}] 未进入聚光，跳过`); await backToList(); continue; }
      const vseller = (popup2.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] || acc.id;

      let onManage = false;
      for (let mg = 1; mg <= 2 && !onManage; mg++) {
        await popup2.goto(`https://ad.xiaohongshu.com/microapp/creativity/inspire?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await sleep(7000);
        await popup2.locator('text=创意管理').first().click({ timeout: 6000 }).catch(() => {});
        await sleep(2000);
        await popup2.locator('text=商业内容管理').first().click({ timeout: 6000 }).catch(() => {});
        await sleep(8000);
        onManage = await popup2.evaluate(() => /商业内容管理/.test(document.body.innerText || '')).catch(() => false);
      }
      if (!onManage) { console.log(`[${acc.name}] 未进入商业内容管理，跳过`); await popup2.close().catch(() => {}); await backToList(); continue; }

      const statCall = async (day) =>
        popup2.evaluate(async ({ vseller, day, pageNum, pageSize, pubStart, pubEnd }) => {
          const res = await fetch('https://ad.xiaohongshu.com/api/leona/creative_center/noteList', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              brandUserId: vseller,
              reportBrandUserId: vseller,
              noteContentTypeList: [], noteType: 0, spuIdList: [], tagIdList: [], recIdList: [],
              noteDataStartTime: day, noteDataEndTime: day,
              notePublishTimeStart: pubStart, notePublishTimeEnd: pubEnd,
              fansNumAccumLower: null, fansNumAccumUpper: null, ownOrderNote: false,
              staffLabelList: [], staffCountry: [], staffProvince: [], staffCity: [],
              pageNum, pageSize, sortDirect: '', sortColumn: '', noteCustomType: 0,
            }),
          });
          const j = await res.json().catch(() => null);
          const d = j?.data ?? {};
          return {
            stat: d.noteStatData ?? null,
            total: d.total ?? 0,
            totalPage: d.totalPage ?? 0,
            rows: (d.noteList ?? []).map((n) => ({
              noteId: String(n.noteId ?? ''),
              authorName: n.authorName ?? '',
              publishTime: n.notePublishTime ?? '',
              isRtb: n.isRtbAdver === 1,
              nd: n.noteData ?? null,
            })),
          };
        }, { vseller, day, pageNum: 1, pageSize: 1, pubStart, pubEnd }).catch(() => null);

      // 逐笔记分页版（合计行 + noteList 一起拿，同请求零额外成本）
      const noteRowsCall = async (day, pageNum) =>
        popup2.evaluate(async ({ vseller, day, pageNum, pageSize, pubStart, pubEnd }) => {
          const res = await fetch('https://ad.xiaohongshu.com/api/leona/creative_center/noteList', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              brandUserId: vseller,
              reportBrandUserId: vseller,
              noteContentTypeList: [], noteType: 0, spuIdList: [], tagIdList: [], recIdList: [],
              noteDataStartTime: day, noteDataEndTime: day,
              notePublishTimeStart: pubStart, notePublishTimeEnd: pubEnd,
              fansNumAccumLower: null, fansNumAccumUpper: null, ownOrderNote: false,
              staffLabelList: [], staffCountry: [], staffProvince: [], staffCity: [],
              pageNum, pageSize, sortDirect: '', sortColumn: '', noteCustomType: 0,
            }),
          });
          const j = await res.json().catch(() => null);
          const d = j?.data ?? {};
          return {
            stat: d.noteStatData ?? null,
            total: d.total ?? 0,
            totalPage: d.totalPage ?? 0,
            rows: (d.noteList ?? []).map((n) => ({
              noteId: String(n.noteId ?? ''),
              authorName: n.authorName ?? '',
              publishTime: n.notePublishTime ?? '',
              isRtb: n.isRtbAdver === 1,
              nd: n.noteData ?? null,
            })),
          };
        }, { vseller, day, pageNum, pageSize: 100, pubStart, pubEnd }).catch(() => null);

      for (const day of statDays) {
        const dayDate = new Date(`${day}T00:00:00+08:00`);
        let stat = null;
        const noteUpserts = [];
        let totalPages = 1;
        for (let page = 1; page <= totalPages && page <= 20; page++) {
          const r = await noteRowsCall(day, page);
          if (!r) { console.log(`[${acc.name} ${day}] p${page} 无响应`); break; }
          if (r.stat) stat = r.stat;
          totalPages = r.totalPage || 1;
          for (const row of r.rows) {
            if (!row.noteId || !row.nd) continue;
            noteUpserts.push({
              brandId: 6,
              noteId: row.noteId,
              day: dayDate,
              impNum: F(row.nd.impNum), readFeedNum: F(row.nd.readFeedNum),
              engageCnt: F(row.nd.engageCnt), followCnt: F(row.nd.followCnt),
              authorName: row.authorName || null,
              vSellerId: vseller,
              notePublishTime: parsePubS(row.publishTime),
              isRtbAdver: row.isRtb,
            });
          }
          if (totalPages <= 1) break;
          await sleep(400);
        }
        if (stat) {
          upserts.push({
            brandId: 6,
            day: dayDate,
            vSellerId: vseller,
            vSellerName: acc.name,
            impNum: F(stat.impNum), readFeedNum: F(stat.readFeedNum), engageCnt: F(stat.engageCnt),
            followCnt: F(stat.followCnt), noteNum: F(stat.noteNum),
            ziranImpCnt: F(stat.ziranImpCnt), ziranReadCnt: F(stat.ziranReadCnt),
            tuiguangImpCnt: F(stat.tuiguangImpCnt), tuiguangReadCnt: F(stat.tuiguangReadCnt),
          });
        }
        if (!stat && !noteUpserts.length) { console.log(`[${acc.name} ${day}] 无数据`); continue; }
        // 逐日即时落库：合计行（全部笔记口径，总览用）+ 逐笔记行（时段发布口径，区域用）
        if (stat) {
          for (const r of upserts) {
            await prisma.koxContentStatDaily.upsert({
              where: { brandId_day_vSellerId: { brandId: r.brandId, day: r.day, vSellerId: r.vSellerId } },
              update: { impNum: r.impNum, readFeedNum: r.readFeedNum, engageCnt: r.engageCnt, followCnt: r.followCnt, noteNum: r.noteNum, ziranImpCnt: r.ziranImpCnt, ziranReadCnt: r.ziranReadCnt, tuiguangImpCnt: r.tuiguangImpCnt, tuiguangReadCnt: r.tuiguangReadCnt, vSellerName: r.vSellerName },
              create: r,
            });
          }
          upserts.length = 0;
        }
        for (const r of noteUpserts) {
          await prisma.koxContentNoteDaily.upsert({
            where: { brandId_noteId_day: { brandId: r.brandId, noteId: r.noteId, day: r.day } },
            update: { impNum: r.impNum, readFeedNum: r.readFeedNum, engageCnt: r.engageCnt, followCnt: r.followCnt, authorName: r.authorName, vSellerId: r.vSellerId, notePublishTime: r.notePublishTime, isRtbAdver: r.isRtbAdver },
            create: r,
          });
        }
      }
      okAcc += 1;
      console.log(`[${acc.name}] ${statDays.length} 天合计行+逐笔记行已落库（${okAcc}/${accounts.filter((a) => a.status === 'active').length}）`);
      await popup2.close().catch(() => {});
      await backToList();
    }
    await prisma.sparkSyncLog.create({
      data: { brandId: 6, syncType: 'content_stat_daily', statDate: sEnd, fetched: okAcc, upserted: okAcc, message: `accounts ok ${okAcc}, days ${statDays.length}, pubWindow ${pubStart}~${pubEnd}` },
    });
    console.log(`[stat-daily] 完成：${okAcc} 账号 × ${statDays.length} 天（发布窗口 ${pubStart} ~ ${pubEnd}）`);
    await browser.close();
    await prisma.$disconnect();
    process.exit(0);
  }
  // ── stat-daily 模式结束 ──

  let idx = -1;
  for (let i = 0; i < (await rowsLoc.count()); i++) {
    if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(TARGET)) { idx = i; break; }
  }
  if (idx < 0) { console.error('未找到目标子账户'); await browser.close(); process.exit(1); }

  let popup = null;
  for (let attempt = 1; attempt <= 3 && !popup; attempt++) {
    const pp = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
    await rowsLoc.nth(idx).locator('text=跳转').first().click({ timeout: 8000 }).catch(() => {});
    await sleep(3500);
    popup = await pp;
    if (!popup) {
      await rowsLoc.nth(idx).locator('text=跳转').first().hover({ timeout: 4000 }).catch(() => {});
      await sleep(1500);
      const picks = listPage.locator('text="聚光平台"');
      for (let i = 0; i < (await picks.count()); i++) {
        if (await picks.nth(i).isVisible().catch(() => false)) {
          const p2 = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
          await picks.nth(i).click({ timeout: 6000 }).catch(() => {});
          popup = await p2;
          break;
        }
      }
    }
    if (popup) {
      // superlogin 中转页可能停留数秒才完成 SSO 跳转：等待 36s，中途 reload 一次
      for (let i = 0; i < 24; i++) {
        if (/vSellerId=[0-9a-f]/.test(popup.url())) break;
        await sleep(1500);
        if (i === 10) await popup.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
      if (/vSellerId=[0-9a-f]/.test(popup.url())) break;
      console.log(`[${attempt}] popup 落地异常: ${popup.url().slice(0, 80)}`);
      await popup.close().catch(() => {});
      popup = null;
    }
    // 兜底：平台改版后跳转可能不弹新窗、在当前页直接进入聚光——
    // 检测列表页已到聚光域时，按落地 URL 新开页复用会话，并立即恢复子账户列表页
    if (!popup) {
      // 人工接力窗口：跳转点击无反应时，最多等 2 分钟，请在浏览器里手动点击目标行的「跳转」
      console.log(`[assist] 若浏览器停在子账户列表页，请手动点击「${TARGET}」行的「跳转」按钮（等待最多 2 分钟）...`);
      for (let i = 0; i < 80; i++) {
        if (/vSellerId=|ad\.xiaohongshu\.com/.test(listPage.url())) break;
        await sleep(1500);
      }
      if (/vSellerId=|ad\.xiaohongshu\.com/.test(listPage.url())) {
        const landed = listPage.url();
        popup = await ctx.newPage();
        await popup.goto(landed, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await sleep(6000);
        listPage
          .goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 })
          .catch(() => {});
        await sleep(9000);
        idx = -1;
        for (let i = 0; i < (await rowsLoc.count()); i++) {
          if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(TARGET)) { idx = i; break; }
        }
      }
    }
    if (attempt < 3) {
      console.log(`[${attempt}] 跳转失败，冷却 20s 重试`);
      await sleep(20000);
      await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(9000);
      idx = -1;
      for (let i = 0; i < (await rowsLoc.count()); i++) {
        if ((await rowsLoc.nth(i).innerText().catch(() => '')).includes(TARGET)) { idx = i; break; }
      }
      if (idx < 0) { console.error('重试未找到目标行'); await browser.close(); process.exit(1); }
    }
  }
  if (!popup) { console.error('未进入聚光'); await browser.close(); process.exit(1); }
  const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? '';
  console.log('[1] vSellerId=', vseller);

  // 进商业内容管理（模块会话）；SPA 导航会销毁执行上下文，整体重试
  let onManage = false;
  for (let mg = 1; mg <= 3 && !onManage; mg++) {
    await popup
      .goto(`https://ad.xiaohongshu.com/microapp/creativity/inspire?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch(() => {});
    await sleep(8000);
    await popup.locator('text=创意管理').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(2000);
    await popup.locator('text=商业内容管理').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(9000);
    onManage = await popup
      .evaluate(() => /商业内容管理/.test(document.body.innerText || ''))
      .catch(() => false);
    if (!onManage) console.log(`[2] 第 ${mg} 次未进入商业内容管理，重试 ...`);
  }
  if (!onManage) {
    console.error('未进入商业内容管理页');
    await popup.screenshot({ path: path.join(__dirname, 'state', 'jc-fail.png') }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
  console.log('[2] 商业内容管理页 OK');

  // PROBE_WINDOW=1：验证 noteData 窗口语义（窗口值 vs 累计值），输出结论后退出
  if (process.env.PROBE_WINDOW === '1') {
    const probeCall = async (ds, de) =>
      popup.evaluate(async ({ vseller, ds, de }) => {
        const res = await fetch('https://ad.xiaohongshu.com/api/leona/creative_center/noteList', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            brandUserId: vseller,
            reportBrandUserId: vseller,
            noteContentTypeList: [],
            noteType: 0,
            spuIdList: [],
            tagIdList: [],
            recIdList: [],
            noteDataStartTime: ds,
            noteDataEndTime: de,
            notePublishTimeStart: '',
            notePublishTimeEnd: '',
            fansNumAccumLower: null,
            fansNumAccumUpper: null,
            ownOrderNote: false,
            staffLabelList: [],
            staffCountry: [],
            staffProvince: [],
            staffCity: [],
            pageNum: 1,
            pageSize: 5,
            sortDirect: '',
            sortColumn: '',
            noteCustomType: 0,
          }),
        });
        const j = await res.json().catch(() => null);
        const d = j?.data ?? {};
        const keys = Object.keys(d).filter((k) => k !== 'noteList');
        const sample = {};
        for (const k of keys) sample[k] = d[k];
        return { keys, sample, row0: (d.noteList ?? [])[0]?.noteData ?? null, rowCount: (d.noteList ?? []).length };
      }, { vseller, ds, de }).catch((e) => ({ err: String(e).slice(0, 120) }));
    for (const [label, ds, de] of [['no-window', '', ''], ['w2', '2026-10-05', '2026-10-07']]) {
      const r = await probeCall(ds, de);
      console.log(`=== [${label}] ds=${ds} de=${de} rows=${r.rowCount ?? '-'}`);
      console.log('data keys:', JSON.stringify(r.keys ?? r));
      console.log('non-list fields:', JSON.stringify(r.sample ?? {}).slice(0, 800));
      console.log('row0 noteData:', JSON.stringify(r.row0));
    }
    await browser.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  // 分页拉取（--days N = 增量：只拉近 N 天发布的笔记；缺省全量）
  const DRYP = process.argv.includes('--dry-run');
  const daysIdx = process.argv.indexOf('--days');
  const INC_DAYS = daysIdx > -1 ? Number(process.argv[daysIdx + 1]) || 0 : 0;
  let pubStart = '';
  let pubEnd = '';
  if (INC_DAYS > 0) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    pubEnd = today;
    pubStart = new Date(new Date(`${today}T00:00:00Z`).getTime() - (INC_DAYS - 1) * 86400000 + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    console.log(`[增量] 发布时间窗口: ${pubStart} ~ ${pubEnd}`);
  }
  let pageNum = 1;
  let totalPage = 1;
  let total = 0;
  const rowsAll = [];
  for (; pageNum <= Math.min(totalPage || 1, MAX_PAGES); pageNum++) {
    let r = null;
    for (let rtry = 1; rtry <= 3; rtry++) {
      r = await popup
        .evaluate(async ({ vseller, pageNum, pageSize, pubStart, pubEnd }) => {
          const post = async (body) => {
            const res = await fetch('https://ad.xiaohongshu.com/api/leona/creative_center/noteList', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(body),
            });
            const raw = await res.text();
            let j = null;
            try { j = JSON.parse(raw); } catch {}
            return j;
          };
          const body = {
            brandUserId: vseller,
            reportBrandUserId: vseller,
            noteContentTypeList: [],
            noteType: 0,
            spuIdList: [],
            tagIdList: [],
            recIdList: [],
            notePublishTimeStart: pubStart,
            notePublishTimeEnd: pubEnd,
            fansNumAccumLower: null,
            fansNumAccumUpper: null,
            ownOrderNote: false,
            staffLabelList: [],
            staffCountry: [],
            staffProvince: [],
            staffCity: [],
            pageNum,
            pageSize,
            sortDirect: '',
            sortColumn: '',
            noteCustomType: 0,
          };
          const j = await post(body);
          const d = j?.data ?? {};
          return {
            ok: j?.code === 0 || j?.success === true,
            msg: j?.msg ?? '',
            total: d.total ?? 0,
            totalPage: d.totalPage ?? 0,
            pageSize: d.pageSize ?? pageSize,
            rows: (d.noteList ?? []).map((n) => ({
              noteId: String(n.noteId ?? ''),
              title: n.noteTitle ?? '',
              cover: n.noteImageUrl ?? '',
              link: n.noteLink ?? '',
              publishTime: n.notePublishTime ?? '',
              authorName: n.authorName ?? '',
              authorUserId: n.authorUserId ?? '',
              authorFans: Number(n.authorFansNum ?? 0),
              isRtb: n.isRtbAdver === 1,
              nd: n.noteData ?? null,
            })),
          };
        }, { vseller, pageNum, pageSize: PAGE_SIZE, pubStart, pubEnd })
        .catch((e) => ({ ok: false, msg: String(e).slice(0, 120), rows: [], totalPage: 0, total: 0, pageSize: PAGE_SIZE }));
      if (r.ok && r.rows.length) break;
      if (rtry < 3) {
        console.log(`[page ${pageNum}] try${rtry} 失败（${r.msg || 'empty'}），5s 后重试 ...`);
        await sleep(5000);
      }
    }
    if (!r.ok || !r.rows.length) {
      console.log(`[page ${pageNum}] 失败或空: ${r.msg || 'empty'}`);
      if (pageNum === 1) { console.error('首页即失败，终止'); break; }
      break;
    }
    if (pageNum === 1) {
      total = r.total;
      totalPage = r.totalPage;
      console.log(`[2] total=${total} totalPage=${totalPage} pageSize=${r.pageSize}`);
    }
    rowsAll.push(...r.rows);
    if (pageNum % 20 === 0) console.log(`  进度 ${pageNum}/${totalPage}，累计 ${rowsAll.length}`);
    // JG_PROBE=1：只拉 2 页，用于探测 noteData 字段
    if (process.env.JG_PROBE === '1' && pageNum >= 2) break;
    if (pageNum >= totalPage) break;
    await sleep(600);
  }
  console.log(`[3] 拉取 ${rowsAll.length}/${total} 行`);
  if (DRYP) {
    console.log('样例:', JSON.stringify(rowsAll.slice(0, 2)), null, 1).slice(0, 800);
    if (rowsAll[0]?.nd) {
      console.log('noteData 字段:', JSON.stringify(rowsAll[0].nd));
      console.log('noteData2 字段:', JSON.stringify(rowsAll[1]?.nd ?? {}));
    }
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  // ── 写库：KoxNote 回填（标题/封面/发布时间/作者/链接）+ 新建未入库笔记 ──
  // 剔官号：authorUserId = 特斯拉官号 userId（5cad9d23...）的笔记不抓不写
  const OFFICIAL_UID = '5cad9d230000000011005d41';
  const noteRows = rowsAll.filter((r) => r.noteId && r.authorUserId !== OFFICIAL_UID);
  const officialSkipped = rowsAll.length - noteRows.length;
  if (officialSkipped) console.log(`[3.5] 剔除官号笔记 ${officialSkipped} 篇`);
  let titleFixed = 0, coverFixed = 0, pubFixed = 0, authorFixed = 0, metricFixed = 0, missing = 0, created = 0;
  const createRows = [];
  const updateOps = [];
  const noteIds = noteRows.map((r) => r.noteId).filter(Boolean);
  const existing = [];
  for (let i = 0; i < noteIds.length; i += 20000) {
    const chunk = noteIds.slice(i, i + 20000);
    const part = await prisma.koxNote.findMany({
      where: { brandId: BRAND_ID, noteId: { in: chunk } },
      select: { id: true, noteId: true, title: true, coverUrl: true, publishTime: true, authorName: true, noteUrl: true, rawJson: true },
    });
    existing.push(...part);
  }
  const exMap = new Map(existing.map((n) => [n.noteId, n]));
  const accounts = await prisma.kosAccount.findMany({
    where: { brandId: BRAND_ID, status: 'enabled' },
    select: { id: true, nickname: true },
  });
  const acctIdByNick = new Map(accounts.map((a) => [a.nickname, a.id]));
  const parsePub = (s) => {
    if (!s) return null;
    const d = new Date(String(s).replace(' ', 'T') + '+08:00');
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // ── 指标叠加：noteData（商业内容管理累计口径，权威源）→ KoxNote 主字段 ──
  // 字段名做容错映射（平台字段名可能变化），首个样本落盘 state/noteData-sample.json 便于核对
  const numOrUndef = (v) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' ? n : undefined; };
  const pickMetric = (nd, keys) => { for (const k of keys) { const v = numOrUndef(nd?.[k]); if (v != null) return v; } return undefined; };
  // 实测字段（2026-10-02 state/noteData-sample.json）：impNum 曝光 / readFeedNum 阅读 / engageCnt 互动 /
  // likeNum 赞 / cmtNum 评 / favNum 藏 / shareNum 分享 / followCnt 关注（累计口径，dateKey 为数据截至日）
  const metricsOf = (nd) => {
    if (!nd || typeof nd !== 'object') return null;
    const m = {
      exposure: pickMetric(nd, ['impNum', 'impCnt', 'impressionNum', 'impression', 'exposureNum', 'showNum']),
      views: pickMetric(nd, ['readFeedNum', 'readNum', 'readCnt', 'clickNum', 'viewNum', 'viewsNum']),
      // 注意：KoxNote 无 interaction 存储列（互动=赞+藏+评+分享 查询期相加），engageCnt 不落库
      likes: pickMetric(nd, ['likeNum', 'likeCnt', 'likesNum', 'digNum']),
      collects: pickMetric(nd, ['favNum', 'collectNum', 'collectCnt', 'collectsNum', 'favoriteNum']),
      comments: pickMetric(nd, ['cmtNum', 'commentNum', 'commentCnt', 'commentsNum']),
      shares: pickMetric(nd, ['shareNum', 'shareCnt', 'sharesNum', 'forwardNum']),
      followCount: pickMetric(nd, ['followCnt', 'followNum', 'followsNum']),
      // 线索效果（用户已在商业内容管理开启该列组）：私信咨询数=进线 / 私信开口数 / 私信留资数 / 表单提交
      pmInquiries: pickMetric(nd, ['messageOpenCnt', 'msgConsultNum', 'messageConsultCnt']),
      pmOpenings: pickMetric(nd, ['messageDrivingOpenCnt', 'msgOpenNum', 'msgOpenCnt']),
      pmLeads: pickMetric(nd, ['msgLeadsNum', 'messageLeadsNum', 'msgLeadsCnt']),
      formLeads: pickMetric(nd, ['leadsSuccess', 'formSubmitNum', 'formLeadsNum']),
    };
    const hit = Object.values(m).filter((v) => v != null);
    return hit.length ? m : null;
  };
  fs.mkdirSync(path.join(__dirname, 'state'), { recursive: true });
  const ndSample = noteRows.find((r) => r.nd);
  if (ndSample) {
    fs.writeFileSync(path.join(__dirname, 'state', 'noteData-sample.json'), JSON.stringify({ noteId: ndSample.noteId, noteData: ndSample.nd }, null, 1), 'utf8');
    console.log('[metrics] noteData 样本已存 state/noteData-sample.json');
  } else {
    console.log('[metrics] 警告：本批行无 noteData 字段，跳过指标叠加');
  }

  for (const r of noteRows) {
    const prev = exMap.get(r.noteId);
    const m = metricsOf(r.nd);
    const mData = m
      ? Object.fromEntries(Object.entries(m).filter(([, v]) => v != null))
      : {};
    if (!prev) {
      // 新建未入库笔记（真实发布时间/标题/作者，作者可匹配基线账号时挂 accountId）——收集后批量 createMany
      const pub = parsePub(r.publishTime);
      const accountId = r.authorName ? acctIdByNick.get(r.authorName) ?? null : null;
      createRows.push({
        noteId: r.noteId,
        brandId: BRAND_ID,
        title: r.title || '(聚光笔记)',
        noteType: 'normal',
        accountType: 'KOS',
        accountId,
        authorName: r.authorName || null,
        publishTime: pub ?? new Date('2026-01-01T00:00:00+08:00'),
        isRtbAdver: r.isRtb ? true : null,
        noteUrl: r.link || null,
        coverUrl: r.cover ? (r.cover.startsWith('http://') ? r.cover.replace('http://', 'https://') : r.cover) : null,
        rawJson: { publish_time_approx: !pub, source: 'content_manage' },
        statDate: pub ?? new Date('2026-01-01T00:00:00+08:00'),
        ...mData,
      });
      created += 1;
      continue;
    }
    const data = {};
    const ph = !prev.title || PLACEHOLDER_TITLES.has(prev.title);
    if (r.title && ph) { data.title = r.title; titleFixed += 1; }
    if (r.cover && (!prev.coverUrl || prev.coverUrl === '')) {
      data.coverUrl = r.cover.startsWith('http://') ? r.cover.replace('http://', 'https://') : r.cover;
      coverFixed += 1;
    }
    // 发布时间一律以平台真实值覆盖（商业内容管理为权威源）
    const pub = parsePub(r.publishTime);
    if (pub) {
      const differs = !prev.publishTime || Math.abs(pub.getTime() - prev.publishTime.getTime()) > 60000;
      if (differs) {
        data.publishTime = pub;
        const raw = { ...(prev.rawJson ?? {}) };
        delete raw.publish_time_approx;
        data.rawJson = raw;
        pubFixed += 1;
      }
    }
    if (r.authorName && !prev.authorName) { data.authorName = r.authorName; authorFixed += 1; }
    if (r.link && !prev.noteUrl) data.noteUrl = r.link;
    // 指标叠加（商业内容管理累计口径，覆盖式刷新：曝光/阅读/赞/藏/评/分享/关注/私信四项）
    for (const [k, v] of Object.entries(mData)) {
      if (v != null && prev[k] !== v) { data[k] = v; metricFixed += 1; }
    }
    if (Object.keys(data).length) updateOps.push(prisma.koxNote.update({ where: { id: prev.id }, data }));
  }
  // 批量写库：createMany 分批 + 事务分组 update（逐条 await 4 万条要 3 小时，分批降到分钟级）
  for (let i = 0; i < createRows.length; i += 500) {
    await prisma.koxNote.createMany({ data: createRows.slice(i, i + 500) });
  }
  console.log(`[4.1] 批量新建 ${createRows.length} 篇完成`);
  for (let i = 0; i < updateOps.length; i += 200) {
    await prisma.$transaction(updateOps.slice(i, i + 200), { timeout: 120000, maxWait: 20000 });
    if ((i / 200) % 20 === 0) console.log(`  写库进度 ${Math.min(i + 200, updateOps.length)}/${updateOps.length}`);
  }
  console.log(`[4.2] 批量更新 ${updateOps.length} 条完成`);
  console.log(`[4] KoxNote: 回填 标题 ${titleFixed} / 封面 ${coverFixed} / 发布时间 ${pubFixed} / 作者 ${authorFixed}；指标刷新 ${metricFixed}；新建 ${created}；库内未覆盖 ${missing}`);

  await prisma.sparkSyncLog.create({
    data: {
      brandId: BRAND_ID,
      syncType: 'juguang_content',
      statDate: new Date(),
      fetched: rowsAll.length,
      upserted: titleFixed + coverFixed + pubFixed + authorFixed + metricFixed + created,
      message: `content-manage rows ${rowsAll.length}/${total} (official skipped ${officialSkipped}), title ${titleFixed}, cover ${coverFixed}, publishTime ${pubFixed}, author ${authorFixed}, metrics ${metricFixed}, created ${created}`,
    },
  }).catch(() => {});

  await browser.close();
  await prisma.$disconnect();
  console.log('=== 商业内容管理同步完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
