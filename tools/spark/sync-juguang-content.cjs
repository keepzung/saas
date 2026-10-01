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
const PLACEHOLDER_TITLES = new Set(['(乐允投放笔记)', '(聚光投放笔记)', '(无标题)']);
const PAGE_SIZE = Number(process.env.JG_PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.JG_MAX_PAGES || 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  if (cfg?.cookie) {
    await ctx.addCookies(cfg.cookie.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
  }
  const listPage = await ctx.newPage();
  await listPage.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  if (/login/i.test(listPage.url())) { console.error('partner 会话失效（先触发 /spark/sync 自动重登）'); await browser.close(); process.exit(1); }
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

  // 进商业内容管理（模块会话）
  await popup.goto(`https://ad.xiaohongshu.com/microapp/creativity/inspire?vSellerId=${vseller}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(8000);
  await popup.locator('text=创意管理').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(2000);
  await popup.locator('text=商业内容管理').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(9000);
  const onManage = await popup.evaluate(() => /商业内容管理/.test(document.body.innerText || ''));
  if (!onManage) { console.error('未进入商业内容管理页'); await popup.screenshot({ path: path.join(__dirname, 'state', 'jc-fail.png') }); await browser.close(); process.exit(1); }
  console.log('[2] 商业内容管理页 OK');

  // 分页拉全量
  const DRYP = process.argv.includes('--dry-run');
  let pageNum = 1;
  let totalPage = 1;
  let total = 0;
  const rowsAll = [];
  for (; pageNum <= Math.min(totalPage || 1, MAX_PAGES); pageNum++) {
    const r = await popup
      .evaluate(async ({ vseller, pageNum, pageSize }) => {
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
          notePublishTimeStart: '',
          notePublishTimeEnd: '',
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
          })),
        };
      }, { vseller, pageNum, pageSize: PAGE_SIZE })
      .catch((e) => ({ ok: false, msg: String(e).slice(0, 120), rows: [], totalPage: 0, total: 0, pageSize: PAGE_SIZE }));
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
    if (pageNum >= totalPage) break;
    await sleep(600);
  }
  console.log(`[3] 拉取 ${rowsAll.length}/${total} 行`);
  if (DRYP) {
    console.log('样例:', JSON.stringify(rowsAll.slice(0, 2)), null, 1).slice(0, 800);
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  // ── 写库：KoxNote 回填（标题/封面/发布时间/作者/链接；占位空值优先）──
  let titleFixed = 0, coverFixed = 0, pubFixed = 0, authorFixed = 0, missing = 0;
  const noteIds = rowsAll.map((r) => r.noteId).filter(Boolean);
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
  for (const r of rowsAll) {
    if (!r.noteId) continue;
    const prev = exMap.get(r.noteId);
    if (!prev) { missing += 1; continue; }
    const data = {};
    const ph = !prev.title || PLACEHOLDER_TITLES.has(prev.title);
    if (r.title && ph) { data.title = r.title; titleFixed += 1; }
    if (r.cover && (!prev.coverUrl || prev.coverUrl === '')) {
      data.coverUrl = r.cover.startsWith('http://') ? r.cover.replace('http://', 'https://') : r.cover;
      coverFixed += 1;
    }
    if (r.publishTime) {
      const d = new Date(r.publishTime.replace(' ', 'T') + '+08:00');
      if (!Number.isNaN(d.getTime())) {
        const approx = prev.rawJson?.publish_time_approx === true;
        if (!prev.publishTime || approx) { data.publishTime = d; pubFixed += 1; }
      }
    }
    if (r.authorName && !prev.authorName) { data.authorName = r.authorName; authorFixed += 1; }
    if (r.link && !prev.noteUrl) data.noteUrl = r.link;
    if (Object.keys(data).length) await prisma.koxNote.update({ where: { id: prev.id }, data });
  }
  console.log(`[4] KoxNote 回填: 标题 ${titleFixed} / 封面 ${coverFixed} / 发布时间 ${pubFixed} / 作者 ${authorFixed}；库内未覆盖 ${missing}`);

  await prisma.sparkSyncLog.create({
    data: {
      brandId: BRAND_ID,
      syncType: 'juguang_content',
      statDate: new Date(),
      fetched: rowsAll.length,
      upserted: titleFixed + coverFixed + pubFixed + authorFixed,
      message: `content-manage rows ${rowsAll.length}/${total}, title ${titleFixed}, cover ${coverFixed}, publishTime ${pubFixed}, author ${authorFixed}`,
    },
  }).catch(() => {});

  await browser.close();
  await prisma.$disconnect();
  console.log('=== 商业内容管理同步完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
