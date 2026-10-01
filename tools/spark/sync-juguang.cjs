#!/usr/bin/env node
// 聚光标准投·笔记效果同步器（brandId=6）
// 链路：partner 会话（DB cookie / 账密自动重登）→ 子账户「跳转」→ 子账户聚光视图 → 标准投笔记报表（dataSource=note）
// 模式：
//   全量（首次/--full）：2025-01-01 起**按月分段**拉取全部笔记日数据 → rawJson.juguang_agg 覆盖为完整投流累计
//   增量（默认）：各笔记游标(juguang_synced_to)+1 ~ 昨天，逐月分段拉取 → 主字段叠加增量，游标推进
// 主字段口径：exposure/views/私信三数 = 自然基线(xlsx 快照) + 聚光增量（不重复计算，juguang_agg 独立保存投流全量）
// 用法:
//   node sync-juguang.cjs                （增量）
//   node sync-juguang.cjs --full         （全量回补 2025-01-01 起）
//   node sync-juguang.cjs --start 2026-09-01 --end 2026-09-30
//   node sync-juguang.cjs --dry-run
//   HEADLESS=0 node sync-juguang.cjs     （partner 滑块人工辅助）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
// 浏览器：本地用 playwright（完整包）；生产用 playwright-core + 已装 chromium 探测
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const pc = backendRequire('playwright-core');
  const findChromium = () => {
    const bases = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
      '/root/.cache/ms-playwright',
      path.join(process.env.HOME ?? '', '.cache/ms-playwright'),
    ].filter(Boolean);
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
      for (const d of dirs) {
        for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux']) {
          const exe = path.join(base, d, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
          if (fs.existsSync(exe)) return exe;
        }
      }
    }
    return null;
  };
  const exe = findChromium();
  chromium = { launch: (opts) => pc.chromium.launch({ ...opts, executablePath: exe ?? undefined }) };
}
const BRAND_ID = 6;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, 'state', 'partner-full');
const STATE_FILE = path.join(OUT, 'partner-state-latest.json');
const PAGE_SIZE = 1000;
const FULL_START = '2025-01-01';
// 09-25~09-30 由 ranf 覆盖（避免双算）；聚光笔记报表从 2026-10-01 起接管
const DEFAULT_BACKFILL_FROM = '2026-10-01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num0 = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FULL = argv.includes('--full');
const startIdx = argv.indexOf('--start');
const endIdx = argv.indexOf('--end');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const yesterday = () => {
  const t = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  // 减一天后补回 +8h 再取日期，避免 toISOString（UTC）回退一天
  return new Date(new Date(`${t}T00:00:00+08:00`).getTime() - 86400000 + 8 * 3600000).toISOString().slice(0, 10);
};
// [start,end] 切成自然月段（纯字符串算术，避免 setMonth 时区陷阱死循环）
function nextMonth(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function monthSegments(start, end) {
  const segs = [];
  let cur = start.slice(0, 7);
  const endM = end.slice(0, 7);
  let guard = 0;
  while (cur <= endM && guard++ < 300) {
    const segStart = cur === start.slice(0, 7) ? start : `${cur}-01`;
    const lastDay = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)), 0).getDate();
    const segEnd = cur === endM ? end : `${cur}-${String(lastDay).padStart(2, '0')}`;
    segs.push([segStart, segEnd]);
    cur = nextMonth(cur);
  }
  return segs;
}

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  if (!cfg) { console.error('缺 SparkOrgConfig brandId=6'); process.exit(1); }

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const mkCtx = async (cookieStr) => {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
    if (cookieStr) {
      await ctx.addCookies(cookieStr.split('; ').map((p) => {
        const i = p.indexOf('=');
        return { name: p.slice(0, i), value: p.slice(i + 1), domain: '.xiaohongshu.com', path: '/' };
      }));
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
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      if (!/login|signin/i.test(page.url())) {
        fs.mkdirSync(OUT, { recursive: true });
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

  let ctx = await mkCtx(cfg.cookie);
  let lp = await loginPartner(ctx);
  if (!lp.ok && fs.existsSync(STATE_FILE)) {
    await ctx.close();
    ctx = await browser.newContext({ storageState: STATE_FILE, userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
    lp = await loginPartner(ctx);
  }
  if (!lp.ok) { console.error('partner 会话不可用：HEADLESS=0 人工登录一次后重跑'); await browser.close(); process.exit(1); }
  const listPage = lp.page;

  console.log('[1] 子账户列表 ...');
  await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(12000);
  await listPage.evaluate(() => {
    document.querySelectorAll('.dm-tour-guide-mark, [class*=tour-guide], [class*=tour-mask], [class*=notice-bar]').forEach((e) => e.remove());
  }).catch(() => {});
  for (const t of ['知道了', '我知道了']) {
    const b = listPage.locator(`text=${t}`).first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
  }
  await sleep(500);
  const rowsLoc = listPage.locator('tbody tr');
  // 按页枚举（10 条/页，第二页含「特斯拉KOS项目-基础」）；非特斯拉账号（如阿维塔）跳过
  const enumeratePage = async () => {
    const out = [];
    const rowCount = await rowsLoc.count();
    for (let i = 0; i < rowCount; i++) {
      const txt = (await rowsLoc.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ');
      const idm = txt.match(/([0-9a-f]{24})/);
      if (idm && /特斯拉/.test(txt)) out.push({ name: txt.split(' ')[0].slice(0, 30), id: idm[1], idx: i, status: /冻结/.test(txt) ? 'frozen' : 'active' });
    }
    return out;
  };
  const gotoNextPage = async () => {
    const nextBtn = listPage.locator('[class*=pagination] [class*=next], li[class*=next], button[class*=next]').locator('visible=true').first();
    if (!(await nextBtn.count())) return false;
    const disabled = await nextBtn.evaluate((el) => el.className.includes('disabled') || el.getAttribute('disabled') !== null).catch(() => true);
    if (disabled) return false;
    await nextBtn.click({ timeout: 5000 }).catch(() => {});
    await sleep(5000);
    return true;
  };

  const end = endIdx > -1 ? argv[endIdx + 1] : yesterday();
  // 全局起点：--full → FULL_START；否则最早游标+1 与默认回补点取早
  let globalStart;
  if (FULL || startIdx > -1) globalStart = startIdx > -1 ? argv[startIdx + 1] : FULL_START;
  else {
    globalStart = DEFAULT_BACKFILL_FROM;
    const cur = await prisma.koxNote.findMany({ where: { brandId: BRAND_ID, rawJson: { not: null } }, select: { rawJson: true } });
    for (const c of cur) {
      const to = c.rawJson?.juguang_synced_to;
      if (!to) continue;
      if (to >= end) continue;
      const next = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
      if (next < globalStart) globalStart = next;
    }
    if (FULL) globalStart = FULL_START;
  }
  const segments = monthSegments(globalStart, end);
  console.log(`[2] 同步区间: ${globalStart} ~ ${end}（${segments.length} 个月段，${FULL ? '全量' : '增量'}）${DRY ? '（dry-run）' : ''}`);

  const agg = new Map(); // noteId -> {noteId, vSeller, name, rows: Map(day->sum)}
  let accountOk = 0;
  let accountTotal = 0;
  let hasNextPage = true;
  for (let pg = 0; pg < 6 && hasNextPage; pg++) {
  const pageAccounts = await enumeratePage();
  accountTotal += pageAccounts.length;
  for (const acc of pageAccounts) {
    if (acc.status === 'frozen') { console.log(`[${acc.name}] 冻结跳过`); continue; }
    const row = rowsLoc.nth(acc.idx);
    const rowJump = row.locator('text=跳转').first();
    let popup = null;
    // 跳转重试（最多 2 次：点击偶发无响应）
    for (let attempt = 1; attempt <= 2 && !popup; attempt++) {
      const popupPromise = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
      await rowJump.click({ timeout: 8000 }).catch(() => {});
      await sleep(3500);
      popup = await popupPromise;
      if (!popup) {
        await rowJump.hover({ timeout: 4000 }).catch(() => {});
        await sleep(1200);
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
      if (!popup && attempt === 1) {
        console.log(`[${acc.name}] 第 1 次跳转失败，回列表重试 ...`);
        await listPage.goto('https://partner.xiaohongshu.com/partner/subAccount-list', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await sleep(9000);
      }
    }
    if (!popup) { console.log(`[${acc.name}] 未进入聚光，跳过`); continue; }
    await popup.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
    await sleep(6000);
    const vseller = (popup.url().match(/vSellerId=([0-9a-f]+)/) || [])[1] ?? acc.id;
    // 关键：先导航到「数据→标准投→笔记报表」页（会话模块就绪后报表 API 才返回数据）
    await popup
      .goto(`https://ad.xiaohongshu.com/aurora/ad/datareports-basic/note?vSellerId=${vseller}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })
      .catch(() => {});
    await sleep(10000);

    let noteRows = 0;
    for (const [segStart, segEnd] of segments) {
      let pageNum = 1;
      let totalPage = 1;
      for (; pageNum <= totalPage && pageNum <= 80; pageNum++) {
        // 页面上下文内解析，仅回传精简字段（避免大响应截断）
        const list = await popup.evaluate(
          async ({ body }) => {
            const doFetch = async (cols) => {
              const res = await fetch('https://ad.xiaohongshu.com/api/leona/rtb/common/data/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ...body, columns: cols }),
              });
              const raw = await res.text();
              let j = null;
              try { j = JSON.parse(raw); } catch {}
              return { raw, j };
            };
            // 列尝试：名称列 + 新增种草人群候选列（失败逐级回退）
            const colsNames = [...body.columns, 'noteName', 'userName'];
            const colsFull = [...colsNames, 'grassUserNum', 'newGrassUserNum', 'tiUserNum'];
            let r1 = await doFetch(colsFull);
            let j = r1.j;
            if (!j || (j.code !== 0 && j.success !== true)) {
              if (process.env.JG_DEBUG) console.log('[debug] full cols failed:', String(r1.raw).slice(0, 200));
              const r2 = await doFetch(colsNames);
              j = r2.j;
              if (!j || (j.code !== 0 && j.success !== true)) {
                if (process.env.JG_DEBUG) console.log('[debug] base failed:', String(r2.raw).slice(0, 300));
              }
            }
            const dl = j?.data?.dataList ?? [];
            const tp = j?.data?.page?.totalPage ?? 1;
            const out = [];
            let itemKeysSample = '';
            for (const item of dl) {
              let v = {};
              try { v = JSON.parse(item.dataValueJson ?? '{}'); } catch {}
              if (!itemKeysSample) itemKeysSample = Object.keys(v).join(',');
              out.push({
                noteId: String(v.noteId ?? ''),
                day: String(v.time ?? ''),
                name: String(v.noteName ?? item.noteName ?? item.name ?? ''),
                creator: String(v.userName ?? item.userName ?? ''),
                grass: num0(v.grassUserNum ?? v.newGrassUserNum ?? 0),
                fee: num0(v.fee), imp: num0(v.impression), click: num0(v.click),
                inter: num0(v.interaction), inq: num0(v.messageConsult),
                leads: num0(v.msgLeadsNum), initMsg: num0(v.initiativeMessage),
              });
            }
            return { out, totalPage: tp, itemKeysSample };
          },
          {
            body: {
              pageNum, pageSize: PAGE_SIZE, sorts: [], filters: [], dataCaliber: 0,
              timeUnit: 'DAY', splitColumns: [], startDate: segStart, endDate: segEnd,
              webModule: 'base_report_page', dataSource: 'note', dataPattern: 'table',
              columns: ['time', 'noteId', 'fee', 'impression', 'click', 'interaction', 'messageConsult', 'initiativeMessage', 'msgLeadsNum'],
            },
          },
        ).catch(() => ({ out: [], totalPage: 1 }));
        if (list.itemKeysSample && !agg.size) console.log(`[cols] value keys: ${list.itemKeysSample}`);
        totalPage = list.totalPage || 1;
        for (const r of list.out) {
          if (!r.noteId || !r.day) continue;
          const cur2 = agg.get(r.noteId) ?? { noteId: r.noteId, vSeller: vseller, name: acc.name, title: r.name, creator: r.creator, days: new Map() };
          if (r.name && !cur2.title) cur2.title = r.name;
          if (r.creator && !cur2.creator) cur2.creator = r.creator;
          const d = cur2.days.get(r.day) ?? { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, leads: 0, initMsg: 0, grass: 0 };
          d.fee += r.fee; d.imp += r.imp; d.click += r.click; d.inter += r.inter; d.inq += r.inq; d.leads += r.leads; d.initMsg += r.initMsg; d.grass += r.grass;
          cur2.days.set(r.day, d);
          agg.set(r.noteId, cur2);
          noteRows += 1;
        }
        // 空段/空页继续后续月份（早期月份无投放属正常）
        if (pageNum >= totalPage) break;
        await sleep(400);
      }
    }
    accountOk += 1;
    console.log(`[${acc.name}] 笔记日行 ${noteRows} 条`);
    await popup.close().catch(() => {});
    await sleep(2000);
  }
  hasNextPage = pg === 0 && !pageAccounts.length ? false : await gotoNextPage();
  }

  console.log(`\n[3] 聚合笔记 ${agg.size} 篇（${accountOk}/${accountTotal} 子账户）`);
  if (DRY) {
    console.log('--dry-run 样例:', JSON.stringify([...agg.values()].slice(0, 2).map((v) => ({ noteId: v.noteId, days: [...v.days.entries()].slice(0, 3) })), null, 1).slice(0, 1000));
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  // ── 写库 0：KoxJuguangNoteDaily（note×日，运营趋势数据源；受影响天整体重建，幂等）──
  const touchedDays = new Set();
  for (const cur of agg.values()) for (const day of cur.days.keys()) touchedDays.add(day);
  for (const day of [...touchedDays].sort()) {
    await prisma.koxJuguangNoteDaily.deleteMany({ where: { brandId: BRAND_ID, day: new Date(`${day}T00:00:00+08:00`) } });
  }
  const dailyRows = [];
  for (const cur of agg.values()) {
    for (const [day, d] of cur.days) {
      dailyRows.push({
        brandId: BRAND_ID,
        noteId: cur.noteId,
        day: new Date(`${day}T00:00:00+08:00`),
        vSeller: cur.vSeller,
        title: cur.title || null,
        creator: cur.creator || null,
        fee: Math.round(d.fee * 100) / 100,
        impression: BigInt(d.imp),
        click: BigInt(d.click),
        interaction: BigInt(d.inter),
        msgInquiries: BigInt(d.inq),
        msgOpenings: BigInt(d.initMsg),
        msgLeads: BigInt(d.leads),
        grassUser: BigInt(d.grass),
      });
    }
  }
  for (let i = 0; i < dailyRows.length; i += 1000) {
    await prisma.koxJuguangNoteDaily.createMany({ data: dailyRows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`[3.5] KoxJuguangNoteDaily 写入 ${dailyRows.length} 行（${touchedDays.size} 天）`);

  // ── 写库 ──
  const noteIds = [...agg.keys()];
  const PLACEHOLDER_TITLES = new Set(['(乐允投放笔记)', '(聚光投放笔记)', '(无标题)']);
  const existing = await prisma.koxNote.findMany({
    where: { brandId: BRAND_ID, noteId: { in: noteIds } },
    select: { id: true, noteId: true, accountId: true, title: true, exposure: true, views: true, pmInquiries: true, pmOpenings: true, pmLeads: true, rawJson: true, authorName: true },
  });
  const existMap = new Map(existing.map((n) => [n.noteId, n]));
  const accountsAll = await prisma.koxNote.findMany({ where: { brandId: BRAND_ID }, select: { authorName: true } });
  const acctIdByNick = new Map((await prisma.kosAccount.findMany({ where: { brandId: BRAND_ID }, select: { id: true, nickname: true } })).map((a) => [a.nickname, a.id]));
  void accountsAll;

  let created = 0, updated = 0, skipped = 0;
  // JG_NOTE_OVERLAY=1 才做主字段叠加（默认停用：运营趋势改用 KoxJuguangNoteDaily，避免基线双算）
  // 停用时仅回填标题/作者/账号归属（titleFix/authorFix），不建新笔记、不动指标
  const NOTE_OVERLAY = process.env.JG_NOTE_OVERLAY === '1';
  for (const cur of agg.values()) {
    const allRows = [...cur.days.entries()].map(([day, d]) => ({ day, ...d })).sort((a, b) => (a.day < b.day ? -1 : 1));
    const prev = existMap.get(cur.noteId);
    const cursorRaw = prev?.rawJson?.juguang_synced_to ?? null;
    // 全量聚合（juguang_agg，独立投流口径，覆盖式幂等）
    const aggSum = allRows.reduce(
      (a, r) => ({ fee: a.fee + r.fee, imp: a.imp + r.imp, click: a.click + r.click, inter: a.inter + r.inter, inq: a.inq + r.inq, leads: a.leads + r.leads, open: a.open + r.initMsg }),
      { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, leads: 0, open: 0 },
    );
    // 主字段增量：仅游标之后（游标前已在基线/前次增量中）
    const from = cursorRaw && !FULL
      ? new Date(new Date(`${cursorRaw}T00:00:00+08:00`).getTime() + 86400000 + 8 * 3600000).toISOString().slice(0, 10)
      : allRows[0].day;
    const incRows = allRows.filter((r) => r.day >= from && r.day <= end);
    const newSynced = allRows.reduce((m, r) => (r.day > m ? r.day : m), from);
    const accountId = prev?.authorName ? acctIdByNick.get(prev.authorName) ?? null : cur.creator ? acctIdByNick.get(cur.creator) ?? null : null;
    // 标题/作者回填：占位或空标题 → 聚光真实标题；作者名可匹配账号时补挂
    const titleFix = cur.title && (!prev?.title || PLACEHOLDER_TITLES.has(prev.title));
    const authorFix = !prev?.authorName && cur.creator ? cur.creator : null;

    if (prev && NOTE_OVERLAY) {
      const d = incRows.reduce(
        (a, r) => ({ imp: a.imp + r.imp, click: a.click + r.click, inq: a.inq + r.inq, open: a.open + r.initMsg, leads: a.leads + r.leads }),
        { imp: 0, click: 0, inq: 0, open: 0, leads: 0 },
      );
      const raw = { ...(prev.rawJson ?? {}) };
      raw.juguang_agg = {
        fee: Math.round(aggSum.fee * 100) / 100, imp: aggSum.imp, click: aggSum.click,
        inter: aggSum.inter, inq: aggSum.inq, leads: aggSum.leads, open: aggSum.open,
        from: allRows[0].day, to: newSynced,
      };
      raw.juguang_synced_to = newSynced;
      await prisma.koxNote.update({
        where: { id: prev.id },
        data: {
          exposure: prev.exposure + d.imp,
          views: prev.views + d.click,
          pmInquiries: prev.pmInquiries + d.inq,
          pmOpenings: prev.pmOpenings + d.open,
          pmLeads: prev.pmLeads + d.leads,
          isRtbAdver: aggSum.fee > 0 ? true : prev.isRtbAdver,
          ...(titleFix ? { title: cur.title } : {}),
          ...(authorFix ? { authorName: authorFix } : {}),
          ...(accountId != null && prev.accountId == null ? { accountId } : {}),
          rawJson: raw,
          statDate: new Date(`${newSynced}T00:00:00+08:00`),
        },
      });
      updated += 1;
    } else if (prev) {
      // 元数据模式：仅标题/作者/账号归属回填
      if (titleFix || authorFix || (accountId != null && prev.accountId == null)) {
        const raw = { ...(prev.rawJson ?? {}) };
        if (!raw.juguang_synced_to) raw.juguang_synced_to = newSynced;
        await prisma.koxNote.update({
          where: { id: prev.id },
          data: {
            ...(titleFix ? { title: cur.title } : {}),
            ...(authorFix ? { authorName: authorFix } : {}),
            ...(accountId != null && prev.accountId == null ? { accountId } : {}),
            rawJson: raw,
          },
        });
        updated += 1;
      } else skipped += 1;
    } else if (NOTE_OVERLAY) {
      const d = aggSum;
      const firstDay = allRows[0].day;
      await prisma.koxNote.create({
        data: {
          noteId: cur.noteId,
          brandId: BRAND_ID,
          title: cur.title || '(聚光投放笔记)',
          noteType: 'normal',
          accountId,
          authorName: cur.creator || null,
          accountType: 'KOS',
          publishTime: new Date(`${firstDay}T00:00:00+08:00`),
          exposure: d.imp,
          views: d.click,
          pmInquiries: d.inq,
          pmOpenings: d.open,
          pmLeads: d.leads,
          isRtbAdver: d.fee > 0 ? true : null,
          rawJson: { juguang_agg: { fee: Math.round(d.fee * 100) / 100, imp: d.imp, click: d.click, inter: d.inter, inq: d.inq, leads: d.leads, open: d.open, from: firstDay, to: newSynced }, juguang_synced_to: newSynced, publish_time_approx: true },
          statDate: new Date(`${newSynced}T00:00:00+08:00`),
        },
      });
      created += 1;
    } else {
      skipped += 1;
    }
  }
  console.log(`[4] KoxNote 写库完成（${NOTE_OVERLAY ? '叠加' : '元数据'}模式）: 更新 ${updated} / 新建 ${created} / 跳过 ${skipped}`);

  await prisma.sparkSyncLog.create({
    data: {
      brandId: BRAND_ID,
      syncType: 'juguang_note',
      statDate: new Date(`${end}T00:00:00+08:00`),
      fetched: noteIds.length,
      upserted: updated + created,
      message: `juguang note ${FULL ? 'FULL' : 'inc'} ${globalStart}~${end}, accounts ${accountOk}/${accountTotal}, updated ${updated}, created ${created}`,
    },
  }).catch(() => {});

  await browser.close();
  await prisma.$disconnect();
  console.log('=== 同步完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
