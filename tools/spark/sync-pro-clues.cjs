#!/usr/bin/env node
// 专业号「线索经营」同步器（brandId=6）——进线/开口/留资（客户行为三分类）+ 概览卡参考值
// 链路：pro.xiaohongshu.com storageState（DB ProOrgConfig / state 文件）→ 账密兜底（PRO_ACCOUNT/PRO_PASSWORD）
//       → POST /ads/api/clue/user/list {startTime,endTime,clueEventTypeList:[1|2|3],pageNum,pageSize:1000}
//       → POST /ads/api/clue/user/statistic（概览卡：进线未开口/开口未留资/留资完成/广告流量/自然流量，全口径参考值）
// 口径：行为时间=当日，按客户去重；KOS-only = 剔除归属账号官号「特斯拉」(belongUserId=5cad9d230000000011005d41 / belongUserName=特斯拉)
// 写库：
//   ProClueDaily   按日聚合（KOS-only 三分类 + 全口径对照 + 概览卡五值）
//   ProClueUserDay 客户×日明细（三行为标记，任意窗口按客户去重聚合用）
// 用法:
//   node sync-pro-clues.cjs                     （增量：最后同步日 ~ 昨天，重抓最后一天容晚到）
//   node sync-pro-clues.cjs --full              （全量回补 2025-01-01 起）
//   node sync-pro-clues.cjs --start 2026-09-01 --end 2026-09-30 [--dry-run]
//   HEADLESS=0 ...（登录人工辅助）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const pc = backendRequire('playwright-core');
  const findChromium = () => {
    const bases = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
      '/root/.cache/ms-playwright',
      '/home/deploy/.cache/ms-playwright',
      path.join(process.env.HOME ?? '', '.cache/ms-playwright'),
    ].filter(Boolean);
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
      for (const d of dirs) {
        for (const sub of ['chrome-linux', 'chrome-win64', 'chrome-win']) {
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
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CLUE_PAGE = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';
const STATE_FILE = path.join(__dirname, 'state', 'auth-tesla2.json');
const FULL_START = process.env.PRO_CLUE_FULL_START || '2025-01-01';
const OFFICIAL_BELONG_ID = '5cad9d230000000011005d41';
const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FULL = argv.includes('--full');
const startIdx = argv.indexOf('--start');
const endIdx = argv.indexOf('--end');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const envB = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envB)) {
  for (const line of fs.readFileSync(envB, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const dayAdd = (day, n) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
const todayCN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const yesterdayCN = () => dayAdd(todayCN(), -1);
const isOfficial = (r) => r.belongUserId === OFFICIAL_BELONG_ID || r.belongUserName === '特斯拉';

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: BRAND_ID } });

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctxOpts = { userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 1000 } };
  let storageState;
  if (cfg?.storageState) { try { storageState = JSON.parse(cfg.storageState); } catch {} }
  if (!storageState && fs.existsSync(STATE_FILE)) { try { storageState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {} }
  const ctx = await browser.newContext(storageState ? { ...ctxOpts, storageState } : ctxOpts);
  const page = await ctx.newPage();

  // ── 登录 ──
  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  if (/login|passport/i.test(page.url())) {
    console.log('[login] 账密登录 ...');
    const USER = process.env.PRO_ACCOUNT || process.env.SPARK_ACCOUNT_TESLA2;
    const PASS = process.env.PRO_PASSWORD || process.env.SPARK_PASSWORD_TESLA2;
    const userInput = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').locator('visible=true').first();
    const passInput = page.locator('input[type="password"]').locator('visible=true').first();
    await userInput.fill(USER, { timeout: 15000 }).catch(() => {});
    await passInput.fill(PASS, { timeout: 15000 }).catch(() => {});
    await sleep(500);
    const agree = page.locator('text=我已阅读并同意').first();
    if (await agree.count().catch(() => 0)) {
      try {
        const box = await agree.boundingBox({ timeout: 3000 });
        if (box) await page.mouse.click(box.x - 20, box.y + box.height / 2);
      } catch {}
    }
    await page.locator('button:has-text("登")').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(6000);
    const slider = page.locator('[class*=slider] [class*=btn], [class*=slider] [class*=handler], [class*=drag]').locator('visible=true').first();
    if (await slider.count().catch(() => 0)) {
      try {
        const box = await slider.boundingBox({ timeout: 3000 });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 30; i++) { await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2, { steps: 2 }); await sleep(30); }
        await page.mouse.up();
      } catch {}
      await sleep(3000);
    }
    if (/login|passport/i.test(page.url())) {
      await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(8000);
    }
    if (/login|passport/i.test(page.url())) {
      // HEADLESS=0 时等待人工完成登录（扫码/滑块），最多 5 分钟
      console.log('[login] 等待人工完成登录（最多 5 分钟），请在浏览器窗口中操作 ...');
      let manualOk = false;
      for (let i = 0; i < 60; i++) {
        await sleep(5000);
        if (!/login|passport/i.test(page.url())) { manualOk = true; break; }
      }
      if (!manualOk) {
        console.error('pro 登录失败（等待人工登录超时）');
        await browser.close();
        process.exit(1);
      }
    }
  }
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(await ctx.storageState()), 'utf8');
  if (cfg) {
    const cookieStr = (await ctx.storageState()).cookies.filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
    void cookieStr;
  }
  console.log('[login] OK');

  // ── 获客工具统计（客户管理旧版，客户指定留资口径 2026-10-08）──
  // 基线账号（enabled 且有 authorId）逐账号拉取；全局行 belongUserId='' 含官号供对账
  const toolAccounts = await prisma.kosAccount.findMany({
    where: { brandId: BRAND_ID, status: 'enabled' },
    select: { authorId: true },
  });
  const TOOL_IDS = [...new Set(toolAccounts.map((a) => a.authorId).filter(Boolean))];
  console.log(`[tool-stat] 基线账号 ${TOOL_IDS.length} 个`);
  const fetchToolStatDay = async (day, ids) => {
    return page.evaluate(async ({ day, ids }) => {
      const post = async (belongUserId) => {
        const r = await fetch('https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId, pageNum: 1, pageSize: 10 }),
        });
        return r.json().catch(() => null);
      };
      const out = [];
      for (const id of ids) {
        const j = await post(id);
        if (!j || j.code !== 0) return { err: `statistical ${id || 'ALL'} 失败: ${String(j?.msg ?? '').slice(0, 60)}` };
        const dKey = day.replace(/-/g, '');
        const row = (j?.data?.userStatisticalDatas ?? []).find((x) => String(x.dtm) === dKey) ?? null;
        out.push({ belongUserId: id, row });
        await new Promise((r2) => setTimeout(r2, 120));
      }
      return { rows: out };
    }, { day, ids });
  };

  // ── 区间 ──
  const end = endIdx > -1 ? argv[endIdx + 1] : yesterdayCN();
  let start;
  if (FULL || startIdx > -1) start = startIdx > -1 ? argv[startIdx + 1] : FULL_START;
  else {
    const last = await prisma.proClueDaily.findFirst({ where: { brandId: BRAND_ID }, orderBy: { day: 'desc' }, select: { day: true } });
    start = last ? dayAdd(new Date(last.day.getTime() + 8 * 3600000).toISOString().slice(0, 10), 0) : FULL_START; // 重抓最后一天（容晚到线索）
  }
  const days = [];
  for (let d = start, g = 0; d <= end && g++ < 1500; d = dayAdd(d, 1)) days.push(d);
  // 获客工具统计回填起点（TOOL_START 可独立于线索增量区间，避免长区间全量时逐账号拉取过久）
  const toolStart = process.env.TOOL_START && /^\d{4}-\d{2}-\d{2}$/.test(process.env.TOOL_START)
    ? (process.env.TOOL_START > start ? process.env.TOOL_START : start)
    : start;
  console.log(`[1] 同步区间: ${start} ~ ${end}（${days.length} 天，${FULL ? '全量' : '增量'}）${DRY ? '（dry-run）' : ''}；获客工具统计自 ${toolStart}`);

  // ── 页面上下文 fetch ──
  const fetchDay = async (day) => {
    return page.evaluate(async ({ day, OFFICIAL_ID, pageSize, maxPages }) => {
      const post = async (p, body) => {
        const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/' + p, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
        });
        return r.json().catch(() => null);
      };
      const pick = (r) => ({
        customerUserId: String(r.customerUserId ?? ''),
        belongUserId: r.belongUserId ?? null,
        belongUserName: r.belongUserName ?? null,
        sysTagId: r.sysTag?.tagId ?? null,
        nickName: r.nickName ?? null,
      });
      const users = new Map(); // customerUserId -> {flags, official, ...}
      const totals = { enterAll: 0, openAll: 0, leadsAll: 0, enterKos: 0, openKos: 0, leadsKos: 0 };
      const evFlags = { 1: 'entered', 2: 'opened', 3: 'leads' };
      for (const [ev, flag] of Object.entries(evFlags)) {
        for (let pn = 1; pn <= maxPages; pn++) {
          const j = await post('user/list', { startTime: day, endTime: day, clueEventTypeList: [Number(ev)], pageNum: pn, pageSize });
          if (!j || j.code !== 0) return { err: `list ev${ev} p${pn} 失败: ${String(j?.msg ?? '').slice(0, 80)}` };
          const rows = j?.data?.userList ?? [];
          for (const r of rows) {
            const p = pick(r);
            if (!p.customerUserId) continue;
            const official = p.belongUserId === OFFICIAL_ID || p.belongUserName === '特斯拉';
            const cur = users.get(p.customerUserId) ?? { entered: false, opened: false, leads: false, official: true, belongUserId: p.belongUserId, belongUserName: p.belongUserName, sysTagId: p.sysTagId, nickName: p.nickName };
            cur[flag] = true;
            if (!official) cur.official = false;
            if (official) { cur.belongUserId = p.belongUserId; cur.belongUserName = p.belongUserName; }
            users.set(p.customerUserId, cur);
          }
          const total = j?.data?.cluePageInfo?.total ?? 0;
          if (flag === 'entered') totals.enterAll = total;
          if (flag === 'opened') totals.openAll = total;
          if (flag === 'leads') totals.leadsAll = total;
          if (rows.length < pageSize || pn * pageSize >= total) break;
          await new Promise((r2) => setTimeout(r2, 300));
        }
      }
      for (const u of users.values()) {
        if (u.entered) totals.enterKos += u.official ? 0 : 1;
        if (u.opened) totals.openKos += u.official ? 0 : 1;
        if (u.leads) totals.leadsKos += u.official ? 0 : 1;
      }
      const st = await post('user/statistic', { startTime: day, endTime: day, sysTagIds: ['2', '3', '4', '11', '12'], userTagIds: [] });
      const cards = {};
      for (const t of st?.data?.tagStatList ?? []) cards[t.tagId] = t.count ?? 0;
      return {
        totals,
        users: [...users.entries()].map(([customerUserId, u]) => ({ customerUserId, ...u })),
        cards: {
          enterNotOpen: cards[2] ?? 0,
          openNotLeads: cards[3] ?? 0,
          leadsDone: cards[4] ?? 0,
          adTraffic: cards[11] ?? 0,
          organic: cards[12] ?? 0,
        },
      };
    }, { day, OFFICIAL_ID: OFFICIAL_BELONG_ID, pageSize: PAGE_SIZE, maxPages: MAX_PAGES });
  };

  let done = 0;
  for (const day of days) {
    const r = await fetchDay(day).catch((e) => ({ err: String(e).slice(0, 120) }));
    if (r.err) { console.log(`[${day}] 失败: ${r.err}`); continue; }
    const { totals, users, cards } = r;
    if (DRY) {
      console.log(`[${day}] dry: enterAll=${totals.enterAll} openAll=${totals.openAll} leadsAll=${totals.leadsAll} | KOS ${totals.enterKos}/${totals.openKos}/${totals.leadsKos} | 卡 ${cards.enterNotOpen}/${cards.openNotLeads}/${cards.leadsDone}/${cards.adTraffic}/${cards.organic} | 用户日 ${users.length}`);
      done++;
      continue;
    }
    const dayDate = new Date(`${day}T00:00:00+08:00`);
    const data = {
      enterKos: totals.enterKos, openKos: totals.openKos, leadsKos: totals.leadsKos,
      enterAll: totals.enterAll, openAll: totals.openAll, leadsAll: totals.leadsAll,
      cardEnterNotOpen: cards.enterNotOpen, cardOpenNotLeads: cards.openNotLeads, cardLeadsDone: cards.leadsDone,
      cardAdTraffic: cards.adTraffic, cardOrganic: cards.organic, fetchedAt: new Date(),
    };
    await prisma.proClueDaily.upsert({
      where: { brandId_day: { brandId: BRAND_ID, day: dayDate } },
      update: data,
      create: { brandId: BRAND_ID, day: dayDate, ...data },
    });
    await prisma.proClueUserDay.deleteMany({ where: { brandId: BRAND_ID, day: dayDate } });
    if (users.length) {
      for (let i = 0; i < users.length; i += 1000) {
        await prisma.proClueUserDay.createMany({
          data: users.slice(i, i + 1000).map((u) => ({
            brandId: BRAND_ID, day: dayDate, customerUserId: u.customerUserId,
            belongUserId: u.belongUserId, belongUserName: u.belongUserName, isOfficial: u.official,
            entered: u.entered, opened: u.opened, leads: u.leads, sysTagId: u.sysTagId, nickName: u.nickName,
          })),
          skipDuplicates: true,
        });
      }
    }
    done++;
    // ── 获客工具统计落库（全局 + 逐基线账号）──
    if (day >= toolStart && !DRY) {
      const t = await fetchToolStatDay(day, ['', ...TOOL_IDS]).catch((e) => ({ err: String(e).slice(0, 120) }));
      if (t.err) { console.log(`[${day}] tool-stat 失败: ${t.err}`); }
      else {
        const F = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
        for (const r of t.rows) {
          const d = r.row ?? {};
          const data = {
            consultUserCnt: F(d.consultUserCnt), msgChatUserCnt: F(d.msgChatUserCnt), msgLeadsUserCnt: F(d.msgLeadsUserCnt),
            serviceCardLeadsUserCnt: F(d.serviceCardLeadsUserCnt), qwAddLeadsUserCnt: F(d.qwAddLeadsUserCnt),
            bookCompLeadsUserCnt: F(d.bookCompLeadsUserCnt), landingPageLeadsUserCnt: F(d.landingPageLeadsUserCnt),
            wechatLeadsUserCnt: F(d.wechatLeadsUserCnt), appCardLeadsUserCnt: F(d.appCardLeadsUserCnt),
            otherLeadsUserCnt: F(d.otherLeadsUserCnt),
          };
          await prisma.proClueToolStatDaily.upsert({
            where: { brandId_day_belongUserId: { brandId: BRAND_ID, day: dayDate, belongUserId: r.belongUserId } },
            update: data,
            create: { brandId: BRAND_ID, day: dayDate, belongUserId: r.belongUserId, ...data },
          });
        }
        console.log(`[${day}] tool-stat 落库 ${t.rows.length} 行（含全局行）`);
      }
    }
    if (done % 10 === 0 || done === days.length) {
      console.log(`[${day}] enter ${totals.enterKos}/${totals.enterAll} open ${totals.openKos}/${totals.openAll} leads ${totals.leadsKos}/${totals.leadsAll} 用户日 ${users.length}（${done}/${days.length}）`);
    }
    await sleep(400);
  }

  await prisma.sparkSyncLog.create({
    data: {
      brandId: BRAND_ID,
      syncType: 'pro_clue',
      statDate: new Date(`${end}T00:00:00+08:00`),
      fetched: done,
      upserted: done,
      message: `pro clue ${FULL ? 'FULL' : 'inc'} ${start}~${end}, days ${done}/${days.length}`,
    },
  }).catch(() => {});

  await browser.close();
  await prisma.$disconnect();
  console.log('=== pro 线索经营同步完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
