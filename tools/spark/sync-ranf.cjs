#!/usr/bin/env node
// ranf 数据查询平台同步器（brandId=6）——乐允全口径笔记×日，运营趋势/笔记效果主数据源
// 链路：data.ranf.cloud 登录（state/账密）→ POST /api/query/execute {templateId:4, st, et} 按周分段
//       → rows（headers: 时间/子账号id/子账号名/笔记ID/笔记链接/作者昵称/作者ID/消费/展现量/点击量/互动量/私信进线数/私信开口数/私信留资数）
// 口径：ranf「时间」= 投放日+1（T+1 出账标注）→ 写库归一减一天（与 xlsx/聚光投放日对齐）
// 写库：
//   1) KoxRanfDaily（品牌×日合计，运营趋势数据源）
//   2) KoxNote 主字段叠加（游标 ranf_synced_to 防重）+ rawJson.ranf_agg/ranf_note_url/ranf_author_id
// 用法:
//   node sync-ranf.cjs                （增量：KoxRanfDaily 最新日+1 ~ 今天）
//   node sync-ranf.cjs --full         （全量回补 2025-01-02 起）
//   node sync-ranf.cjs --start 2026-09-25 --end 2026-10-01 [--dry-run]
//   HEADLESS=0 ... （登录人工辅助）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

// ── 已弃用（2026-10-08 客户确认）：ranf 平台数据不再使用，KoxNote 主字段不得再由 ranf 叠加 ──
// 直接退出，防止 pm2 定时任务继续写入 KoxRanfDaily / KoxNote；
// 如需恢复，删除下面这段退出守卫即可。
console.log('[sync-ranf] ranf 数据源已弃用，脚本不再执行（KoxNote 不来自 ranf）。');
process.exit(0);

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
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, 'state', 'ranf');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, 'state.json');
const USER = process.env.RANF_USER || 'member';
const PASS = process.env.RANF_PASS || 'bp1234n7dj86tp76';
const FULL_START = '2026-01-01';
// xlsx 基线（自然+投流混合）覆盖至 2026-09-24；ranf 叠加主字段仅计基线之后的行（避免投流重复）
const BASELINE_THROUGH = '2026-09-24'; // ranf 最早数据（平台 2025 年未回填，实测 2026-01 起有数）
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
// 纯日期字符串加减天（UTC 锚点 +8h 归正，无时区漂移）
const dayAdd = (day, n) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
const todayCN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
// [start,end] 切 7 天段
function weekSegments(start, end) {
  const segs = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 500) {
    const segEnd = dayAdd(cur, 6) > end ? end : dayAdd(cur, 6);
    segs.push([cur, segEnd]);
    cur = dayAdd(segEnd, 1);
  }
  return segs;
}
const allRowsFirst = (na) => [...na.rows.keys()].sort()[0];
const allRowsLast = (na) => [...na.rows.keys()].sort().pop();

(async () => {
  const prisma = new PrismaClient();
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctxOpts = { userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } };
  let ctx = await browser.newContext(fs.existsSync(STATE) ? { ...ctxOpts, storageState: STATE } : ctxOpts);
  const page = await ctx.newPage();

  // ── 登录 ──
  await page.goto('https://data.ranf.cloud/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  let meOk = await page.evaluate(async () => {
    try { return (await (await fetch('/api/auth/me', { credentials: 'include' })).json())?.code === 0; } catch { return false; }
  }).catch(() => false);
  if (!meOk) {
    console.log('[login] 账密登录 ...');
    await page.locator('input[placeholder="用户名"], input[type="text"]').first().fill(USER);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
    await sleep(6000);
    meOk = await page.evaluate(async () => {
      try { return (await (await fetch('/api/auth/me', { credentials: 'include' })).json())?.code === 0; } catch { return false; }
    }).catch(() => false);
  }
  if (!meOk) { console.error('ranf 登录失败'); await browser.close(); process.exit(1); }
  fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');
  console.log('[login] OK');

  // 模板页上下文
  await page.locator('text=特斯拉-by日by笔记').first().click({ timeout: 8000 }).catch(() => {});
  await sleep(3000);

  // ── 区间 ──
  const today = todayCN();
  const end = endIdx > -1 ? argv[endIdx + 1] : today; // ranf 标注域含今天（昨天投放的 T+1 行）
  let start;
  if (FULL || startIdx > -1) start = startIdx > -1 ? argv[startIdx + 1] : FULL_START;
  else {
    const last = await prisma.koxRanfDaily.findFirst({ where: { brandId: BRAND_ID }, orderBy: { day: 'desc' }, select: { day: true } });
    start = last ? dayAdd(dayKeyOf(last.day), 1) : FULL_START;
  }
  const segments = weekSegments(start, end);
  console.log(`[2] ranf 标注区间: ${start} ~ ${end}（${segments.length} 周，${FULL ? '全量' : '增量'}）${DRY ? '（dry-run）' : ''}`);

  // ── 分段查询 ──
  const daily = new Map(); // 归一投放日 -> {fee, imp, click, inter, inq, open, leads, notes:Set}
  const notesAgg = new Map(); // noteId -> {noteId, url, authorName, authorId, subAccount, firstDay, lastDay, rows:Map(day->...)}
  let truncatedSegs = 0;
  for (const [segStart, segEnd] of segments) {
    const r = await page.evaluate(async ({ st, et }) => {
      const res = await fetch('https://data.ranf.cloud/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: 4, st, et }),
      });
      const num0 = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
      const j = await res.json().catch(() => null);
      if (!j?.data) return { err: String(j?.msg ?? 'no data').slice(0, 100) };
      const headers = j.data.headers ?? [];
      const idx = {};
      headers.forEach((h, i) => (idx[h] = i));
      const out = [];
      for (const row of j.data.rows ?? []) {
        out.push({
          day: String(row[idx['时间']] ?? ''),
          subId: String(row[idx['子账号id']] ?? ''),
          subName: String(row[idx['子账号名']] ?? ''),
          noteId: String(row[idx['笔记ID']] ?? ''),
          noteUrl: String(row[idx['笔记链接']] ?? ''),
          authorName: String(row[idx['作者昵称']] ?? ''),
          authorId: String(row[idx['作者ID']] ?? ''),
          fee: num0(row[idx['消费']]),
          imp: num0(row[idx['展现量']]),
          click: num0(row[idx['点击量']]),
          inter: num0(row[idx['互动量']]),
          inq: num0(row[idx['私信进线数']]),
          open: num0(row[idx['私信开口数']]),
          leads: num0(row[idx['私信留资数']]),
        });
      }
      return { out, total: j.data.total ?? out.length, truncated: !!j.data.truncated, headers };
    }, { st: segStart, et: segEnd }).catch((e) => ({ err: String(e).slice(0, 100) }));

    if (r.err) { console.log(`[${segStart}~${segEnd}] 查询失败: ${r.err}`); continue; }
    if (r.truncated) { truncatedSegs += 1; console.log(`[${segStart}~${segEnd}] ⚠️ truncated（行数超 2 万），该段数据不完整`); }
    for (const row of r.out) {
      if (!row.noteId || !row.day) continue;
      const impDay = dayAdd(row.day, -1); // T+1 标注归一
      const cur = daily.get(impDay) ?? { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0, notes: new Set() };
      cur.fee += row.fee; cur.imp += row.imp; cur.click += row.click; cur.inter += row.inter;
      cur.inq += row.inq; cur.open += row.open; cur.leads += row.leads;
      cur.notes.add(row.noteId);
      daily.set(impDay, cur);
      const na = notesAgg.get(row.noteId) ?? { noteId: row.noteId, url: row.noteUrl, authorName: row.authorName, authorId: row.authorId, subAccount: row.subName, firstDay: impDay, lastDay: impDay, rows: new Map() };
      const d = na.rows.get(impDay) ?? { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 };
      d.fee += row.fee; d.imp += row.imp; d.click += row.click; d.inter += row.inter; d.inq += row.inq; d.open += row.open; d.leads += row.leads;
      na.rows.set(impDay, d);
      if (impDay < na.firstDay) na.firstDay = impDay;
      if (impDay > na.lastDay) na.lastDay = impDay;
      notesAgg.set(row.noteId, na);
    }
    console.log(`[${segStart}~${segEnd}] 行 ${r.total ?? '?'} 条${r.truncated ? '（截断）' : ''}`);
    await sleep(800);
  }
  if (truncatedSegs) console.log(`⚠️ ${truncatedSegs} 周段截断，建议缩小该段重跑（--start/--end）`);

  const days = [...daily.keys()].sort();
  const totalFee = days.reduce((s, d) => s + daily.get(d).fee, 0);
  console.log(`\n[3] 聚合: ${days.length} 天（${days[0] ?? '-'} ~ ${days[days.length - 1] ?? '-'}），fee 合计 ¥${totalFee.toFixed(2)}，笔记 ${notesAgg.size} 篇`);
  if (DRY) {
    console.log('--dry-run 按日样例:', JSON.stringify(days.slice(0, 6).map((d) => ({ day: d, fee: Math.round(daily.get(d).fee * 100) / 100, imp: daily.get(d).imp })), null, 0));
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  // ── 写库 1：KoxRanfDaily ──
  for (const d of days) {
    const v = daily.get(d);
    const data = {
      fee: Math.round(v.fee * 100) / 100,
      impression: BigInt(v.imp), click: BigInt(v.click), interaction: BigInt(v.inter),
      msgInquiries: BigInt(v.inq), msgOpenings: BigInt(v.open), msgLeads: BigInt(v.leads),
      noteCnt: v.notes.size,
    };
    await prisma.koxRanfDaily.upsert({
      where: { day: new Date(`${d}T00:00:00+08:00`) },
      update: data,
      create: { brandId: BRAND_ID, day: new Date(`${d}T00:00:00+08:00`), ...data },
    });
  }
  console.log(`[4] KoxRanfDaily 写入 ${days.length} 天`);

  // ── 写库 2：KoxNote（游标增量叠加）──
  // 2026-10-01 起：笔记主字段叠加默认停用（投放口径改由聚光「标准投笔记报表」sync-juguang.cjs 接管，避免双算）
  // ranf 保留：KoxRanfDaily 趋势数据源 + 笔记元数据（noteUrl/作者/ranf_agg 参考值）
  const NOTE_OVERLAY = process.env.RANF_NOTE_OVERLAY === '1';
  const noteIds = NOTE_OVERLAY ? [...notesAgg.keys()] : [];
  const existing = await prisma.koxNote.findMany({
    where: { brandId: BRAND_ID, noteId: { in: noteIds.length ? noteIds : ['__none__'] } },
    select: { id: true, noteId: true, accountId: true, exposure: true, views: true, pmInquiries: true, pmOpenings: true, pmLeads: true, rawJson: true, authorName: true },
  });
  const existMap = new Map(existing.map((n) => [n.noteId, n]));
  const kosAccounts = await prisma.kosAccount.findMany({ where: { brandId: BRAND_ID }, select: { id: true, nickname: true } });
  const acctIdByNick = new Map(kosAccounts.map((a) => [a.nickname, a.id]));

  let created = 0, updated = 0, skipped = 0;
  if (!NOTE_OVERLAY) {
    // 元数据模式：只补 noteUrl / 作者归属，不动主字段、不新建笔记（新建交给聚光同步器）
    for (const na of notesAgg.values()) {
      const prev = existMap.get(na.noteId);
      if (!prev) { skipped += 1; continue; }
      const raw = { ...(prev.rawJson ?? {}) };
      let changed = false;
      if (na.url && !raw.ranf_note_url) { raw.ranf_note_url = na.url; changed = true; }
      const aggSum = [...na.rows.values()].reduce(
        (a, r) => ({ fee: a.fee + r.fee, imp: a.imp + r.imp, click: a.click + r.click, inter: a.inter + r.inter, inq: a.inq + r.inq, open: a.open + r.open, leads: a.leads + r.leads }),
        { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 },
      );
      raw.ranf_agg = {
        fee: Math.round(aggSum.fee * 100) / 100, imp: aggSum.imp, click: aggSum.click,
        inter: aggSum.inter, inq: aggSum.inq, open: aggSum.open, leads: aggSum.leads,
        from: allRowsFirst(na), to: allRowsLast(na), subAccount: na.subAccount, authorId: na.authorId,
        reference_only: true,
      };      if (!raw.ranf_synced_to) { raw.ranf_synced_to = allRowsLast(na); changed = true; }
      const accountId = prev.accountId ?? acctIdByNick.get(na.authorName) ?? null;
      if (changed || !prev.rawJson?.ranf_agg || accountId != null) {
        await prisma.koxNote.update({
          where: { id: prev.id },
          data: { rawJson: raw, ...(accountId != null ? { accountId } : {}) },
        });
        updated += 1;
      } else skipped += 1;
    }
    console.log(`[5] KoxNote 元数据更新 ${updated} / 跳过 ${skipped}（主字段叠加已停用 RANF_NOTE_OVERLAY!=1）`);
  } else for (const na of notesAgg.values()) {
    const allRows = [...na.rows.entries()].map(([day, d]) => ({ day, ...d })).sort((a, b) => (a.day < b.day ? -1 : 1));
    const prev = existMap.get(na.noteId);
    const cursorRaw = prev?.rawJson?.ranf_synced_to ?? null;
    // 主字段增量：仅游标之后（ranf_synced_to 为归一投放日）
    // 主字段增量起点：有游标→游标+1；全量模式→基线覆盖止日之后（xlsx 基线已含 09-24 前投流，避免重复）
    const from = cursorRaw && !FULL ? dayAdd(cursorRaw, 1) : (FULL ? dayAdd(BASELINE_THROUGH, 1) : allRows[0].day);
    const incRows = allRows.filter((r) => r.day >= from && r.day <= end);
    const newSynced = allRows.reduce((m, r) => (r.day > m ? r.day : m), from);
    if (!incRows.length) { skipped += 1; continue; }
    const dInc = incRows.reduce(
      (a, r) => ({ imp: a.imp + r.imp, click: a.click + r.click, inter: a.inter + r.inter, inq: a.inq + r.inq, open: a.open + r.open, leads: a.leads + r.leads }),
      { imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 },
    );
    const aggSum = allRows.reduce(
      (a, r) => ({ fee: a.fee + r.fee, imp: a.imp + r.imp, click: a.click + r.click, inter: a.inter + r.inter, inq: a.inq + r.inq, open: a.open + r.open, leads: a.leads + r.leads }),
      { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 },
    );
    const accountId = prev?.authorName ? acctIdByNick.get(prev.authorName) ?? null : acctIdByNick.get(na.authorName) ?? null;

    if (prev) {
      const raw = { ...(prev.rawJson ?? {}) };
      raw.ranf_agg = {
        fee: Math.round(aggSum.fee * 100) / 100, imp: aggSum.imp, click: aggSum.click,
        inter: aggSum.inter, inq: aggSum.inq, open: aggSum.open, leads: aggSum.leads,
        from: allRows[0].day, to: newSynced, subAccount: na.subAccount, authorId: na.authorId,
      };
      raw.ranf_synced_to = newSynced;
      if (na.url && !raw.ranf_note_url) raw.ranf_note_url = na.url;
      await prisma.koxNote.update({
        where: { id: prev.id },
        data: {
          exposure: prev.exposure + dInc.imp,
          views: prev.views + dInc.click,
          pmInquiries: prev.pmInquiries + dInc.inq,
          pmOpenings: prev.pmOpenings + dInc.open,
          pmLeads: prev.pmLeads + dInc.leads,
          isRtbAdver: aggSum.fee > 0 ? true : prev.isRtbAdver,
          ...(accountId != null ? { accountId } : {}),
          rawJson: raw,
          statDate: new Date(`${newSynced}T00:00:00+08:00`),
        },
      });
      updated += 1;
    } else {
      await prisma.koxNote.create({
        data: {
          noteId: na.noteId,
          brandId: BRAND_ID,
          title: '(乐允投放笔记)',
          noteType: 'normal',
          accountId,
          authorName: na.authorName || null,
          accountType: 'KOS',
          publishTime: new Date(`${na.firstDay}T00:00:00+08:00`),
          exposure: dInc.imp,
          views: dInc.click,
          pmInquiries: dInc.inq,
          pmOpenings: dInc.open,
          pmLeads: dInc.leads,
          isRtbAdver: aggSum.fee > 0 ? true : null,
          noteUrl: na.url || null,
          rawJson: { ranf_agg: { fee: Math.round(aggSum.fee * 100) / 100, imp: aggSum.imp, click: aggSum.click, inter: aggSum.inter, inq: aggSum.inq, open: aggSum.open, leads: aggSum.leads, from: na.firstDay, to: newSynced, subAccount: na.subAccount, authorId: na.authorId }, ranf_synced_to: newSynced, ranf_note_url: na.url || null, publish_time_approx: true },
          statDate: new Date(`${newSynced}T00:00:00+08:00`),
        },
      });
      created += 1;
    }
  }
  console.log(`[5] KoxNote 写库: 更新 ${updated} / 新建 ${created} / 无增量跳过 ${skipped}`);

  await prisma.sparkSyncLog.create({
    data: {
      brandId: BRAND_ID,
      syncType: 'ranf_note',
      statDate: new Date(`${end}T00:00:00+08:00`),
      fetched: noteIds.length,
      upserted: updated + created,
      message: `ranf ${FULL ? 'FULL' : 'inc'} ${start}~${end}, days ${days.length}, updated ${updated}, created ${created}, truncatedSegs ${truncatedSegs}`,
    },
  }).catch(() => {});

  await browser.close();
  await prisma.$disconnect();
  console.log('=== ranf 同步完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });

function dayKeyOf(d) {
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}