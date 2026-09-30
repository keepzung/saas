#!/usr/bin/env node
// 特斯拉《投放数据源.xlsx》与小红书拉取数据比对（brandId=6）
// 比对对象：
//   A. 重叠窗口 09-25 起：xlsx 账号×天聚合 vs KoxCampaignDailyStat（partner 通道日存档）
//   B. 笔记累计：xlsx 按笔记求和 vs KoxNote 现有快照（旧乐允导出，statDate=2026-09-24）
// 输出：data-import/tesla-compare-report/*.csv + 控制台差异结论
// 只读不写库；在 import-tesla-source.js 之前运行才能拿到导入前差异
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const OUT = path.join(__dirname, 'tesla-compare-report');
const BRAND_ID = 6;
const PARTNER_START = '2026-09-25';

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());
const num = (v) => {
  const s = cell(v).replace(/[,，\s]/g, '');
  if (!s || s === '-' || s === '--') return 0;
  if (/万/.test(s)) return Math.round(parseFloat(s) * 10000) || 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round(v * 100) / 100;
const writeCsv = (name, header, rows) => {
  fs.mkdirSync(OUT, { recursive: true });
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const p = path.join(OUT, name);
  fs.writeFileSync(p, csv, 'utf8');
  console.log(`  → ${p}（${rows.length} 行）`);
};

async function main() {
  const FILE = path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx');
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  console.log(`xlsx 投放数据: ${rows.length} 行`);

  // ── xlsx 聚合 ──
  const dayAgg = new Map(); // day -> totals
  const noteAgg = new Map(); // noteId -> cumulative
  for (const r of rows) {
    const authorId = cell(r['作者ID']);
    const noteId = cell(r['笔记ID']);
    const day = r['时间'] instanceof Date ? r['时间'].toISOString().slice(0, 10) : null;
    if (!day || !authorId) continue;
    const d =
      dayAgg.get(day) ??
      { fee: 0, impression: 0, click: 0, interaction: 0, inq: 0, open: 0, leads: 0 };
    d.fee += num(r['消费']);
    d.impression += num(r['展现量']);
    d.click += num(r['点击量']);
    d.interaction += num(r['互动量']);
    d.inq += num(r['私信进线数']);
    d.open += num(r['私信开口数']);
    d.leads += num(r['私信留资数']);
    dayAgg.set(day, d);
    if (noteId) {
      const n =
        noteAgg.get(noteId) ??
        { nickname: cell(r['昵称']), firstDay: day, lastDay: day, fee: 0, impression: 0, click: 0, interaction: 0, inq: 0, open: 0, leads: 0, days: 0 };
      n.firstDay = day < n.firstDay ? day : n.firstDay;
      n.lastDay = day > n.lastDay ? day : n.lastDay;
      n.fee += num(r['消费']);
      n.impression += num(r['展现量']);
      n.click += num(r['点击量']);
      n.interaction += num(r['互动量']);
      n.inq += num(r['私信进线数']);
      n.open += num(r['私信开口数']);
      n.leads += num(r['私信留资数']);
      n.days += 1;
      noteAgg.set(noteId, n);
    }
  }
  const xs = [...dayAgg.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const xsTotal = xs.reduce(
    (s, [, v]) => ({
      fee: s.fee + v.fee, impression: s.impression + v.impression, click: s.click + v.click,
      interaction: s.interaction + v.interaction, inq: s.inq + v.inq, open: s.open + v.open, leads: s.leads + v.leads,
    }),
    { fee: 0, impression: 0, click: 0, interaction: 0, inq: 0, open: 0, leads: 0 },
  );
  console.log(`xlsx 全期合计: fee=${r2(xsTotal.fee)} imp=${xsTotal.impression} click=${xsTotal.click} 互动=${xsTotal.interaction} 进线=${xsTotal.inq} 开口=${xsTotal.open} 留资=${xsTotal.leads}`);

  const prisma = new PrismaClient();
  try {
    // ═══ A. 重叠窗口（>= 2026-09-25）：xlsx vs partner 日存档 ═══
    console.log(`\n═══ A. 重叠窗口对比（>= ${PARTNER_START}）═══`);
    const overlapDays = xs.filter(([d]) => d >= PARTNER_START).map(([d]) => d);
    if (!overlapDays.length) {
      console.log('无重叠日期，跳过 A');
    } else {
      const start = new Date(`${overlapDays[0]}T00:00:00.000+08:00`);
      const end = new Date(`${overlapDays[overlapDays.length - 1]}T23:59:59.999+08:00`);
      const partnerRows = await prisma.koxCampaignDailyStat.findMany({
        where: { brandId: BRAND_ID, accountKind: 'partner_vseller', statDate: { gte: start, lte: end } },
      });
      const pByDay = new Map();
      for (const r of partnerRows) {
        const k = r.statDate.toISOString().slice(0, 10);
        const v = pByDay.get(k) ?? { fee: 0, impression: 0, click: 0, interaction: 0, inq: 0, open: 0, leads: 0, accounts: new Set() };
        v.fee += Number(r.fee);
        v.impression += r.impression;
        v.click += r.click;
        v.interaction += r.interaction;
        v.inq += r.messageConsult;
        v.open += r.msgChatUserCnt;
        v.leads += r.msgLeadsNum;
        v.accounts.add(r.virtualSellerId);
        pByDay.set(k, v);
      }
      const csvRows = [];
      let diffDays = 0;
      console.log('日期       | xlsx消费   | partner消费 | 差额    | xlsx进线 | p进线 | xlsx留资 | p留资 | p账户数');
      for (const [d, xv] of xs.filter(([d]) => d >= PARTNER_START)) {
        const pv = pByDay.get(d) ?? { fee: 0, impression: 0, click: 0, interaction: 0, inq: 0, open: 0, leads: 0, accounts: new Set() };
        const dFee = r2(xv.fee - pv.fee);
        if (Math.abs(dFee) > 0.01 || xv.inq !== pv.inq || xv.leads !== pv.leads) diffDays += 1;
        console.log(
          `${d} | ${r2(xv.fee).toFixed(2).padStart(9)} | ${pv.fee.toFixed(2).padStart(10)} | ${dFee.toFixed(2).padStart(7)} | ${String(xv.inq).padStart(7)} | ${String(pv.inq).padStart(5)} | ${String(xv.leads).padStart(7)} | ${String(pv.leads).padStart(5)} | ${pv.accounts.size}`,
        );
        csvRows.push([d, r2(xv.fee), r2(pv.fee), dFee, xv.impression, pv.impression, xv.click, pv.click, xv.inq, pv.inq, xv.open, pv.open, xv.leads, pv.leads, pv.accounts.size]);
      }
      const pTotal = [...pByDay.values()].reduce((s, v) => ({ ...s, fee: s.fee + v.fee, impression: s.impression + v.impression, click: s.click + v.click, inq: s.inq + v.inq, open: s.open + v.open, leads: s.leads + v.leads }), { fee: 0, impression: 0, click: 0, inq: 0, open: 0, leads: 0 });
      console.log(`重叠窗口合计: xlsx fee=${r2(xs.filter(([d]) => d >= PARTNER_START).reduce((s, [, v]) => s + v.fee, 0))} vs partner fee=${r2(pTotal.fee)}；有差异天数: ${diffDays}/${overlapDays.length}`);
      writeCsv(
        'A_overlap_partner_daily.csv',
        ['日期', 'xlsx消费', 'partner消费', '消费差额', 'xlsx展现', 'partner展现', 'xlsx点击', 'partner点击', 'xlsx进线', 'partner进线', 'xlsx开口', 'partner开口', 'xlsx留资', 'partner留资', 'partner账户数'],
        csvRows,
      );
    }

    // ═══ B. 笔记累计：xlsx vs KoxNote 快照 ═══
    console.log('\n═══ B. 笔记累计对比（xlsx Σ vs KoxNote 快照）═══');
    const noteIds = [...noteAgg.keys()];
    const dbNotes = await prisma.koxNote.findMany({
      where: { brandId: BRAND_ID, noteId: { in: noteIds } },
      select: { noteId: true, title: true, authorName: true, exposure: true, views: true, pmInquiries: true, pmOpenings: true, pmLeads: true, statDate: true },
    });
    const dbByNoteId = new Map(dbNotes.map((n) => [n.noteId, n]));
    const bRows = [];
    let inDb = 0;
    let newNotes = 0;
    let changed = { exposure: 0, views: 0, inq: 0, open: 0, leads: 0 };
    let sumOld = { exposure: 0, views: 0, leads: 0 };
    let sumNew = { exposure: 0, views: 0, leads: 0 };
    for (const [noteId, n] of noteAgg) {
      const db = dbByNoteId.get(noteId);
      if (!db) {
        newNotes += 1;
        bRows.push([noteId, n.nickname, '(库中无此笔记→将新建)', '', n.impression, n.click, n.inq, n.open, n.leads, r2(n.fee), n.firstDay, n.lastDay, 'new']);
        continue;
      }
      inDb += 1;
      const dE = n.impression - db.exposure;
      const dV = n.click - db.views;
      const dI = n.inq - db.pmInquiries;
      const dO = n.open - db.pmOpenings;
      const dL = n.leads - db.pmLeads;
      if (dE) changed.exposure += 1;
      if (dV) changed.views += 1;
      if (dI) changed.inq += 1;
      if (dO) changed.open += 1;
      if (dL) changed.leads += 1;
      sumOld.exposure += db.exposure; sumOld.views += db.views; sumOld.leads += db.pmLeads;
      sumNew.exposure += n.impression; sumNew.views += n.click; sumNew.leads += n.leads;
      if (dE || dV || dI || dO || dL) {
        const dbDay = db.statDate ? new Date(db.statDate.getTime() + 8 * 3600000).toISOString().slice(0, 10) : '';
        bRows.push([
          noteId, n.nickname, (db.title ?? '').slice(0, 40),
          `旧:曝${db.exposure}/读${db.views}/进${db.pmInquiries}/开${db.pmOpenings}/留${db.pmLeads}`,
          n.impression, n.click, n.inq, n.open, n.leads, r2(n.fee),
          `Δ曝${dE}/Δ读${dV}/Δ进${dI}/Δ开${dO}/Δ留${dL}`, `${dbDay}→${n.lastDay}`, 'diff',
        ]);
      }
    }
    console.log(`xlsx 笔记 ${noteAgg.size} 篇：库中已有 ${inDb} / 全新 ${newNotes}`);
    console.log(`已有笔记字段变化数: 曝光 ${changed.exposure} / 阅读 ${changed.views} / 进线 ${changed.inq} / 开口 ${changed.open} / 留资 ${changed.leads}`);
    console.log(`已有笔记合计 曝光: ${sumOld.exposure} → ${sumNew.exposure}（Δ${sumNew.exposure - sumOld.exposure}）；阅读: ${sumOld.views} → ${sumNew.views}（Δ${sumNew.views - sumOld.views}）；留资: ${sumOld.leads} → ${sumNew.leads}（Δ${sumNew.leads - sumOld.leads}）`);
    writeCsv(
      'B_note_diff.csv',
      ['笔记ID', '账号', '标题', '库内旧值', 'xlsx曝光', 'xlsx阅读', 'xlsx进线', 'xlsx开口', 'xlsx留资', 'xlsx消费', '差异', '快照变化', '类型'],
      bRows,
    );

    // ═══ C. 口径基准（用于差异归因）═══
    console.log('\n═══ C. 口径基准 ═══');
    const projTotal = await prisma.koxCampaignProject.findMany({ where: { brandId: BRAND_ID }, select: { name: true, importedStats: true } });
    const legacyFee = projTotal.reduce((s, p) => s + ((p.importedStats ?? {}).fee ?? 0), 0);
    const partnerAll = await prisma.koxCampaignDailyStat.aggregate({
      where: { brandId: BRAND_ID, accountKind: 'partner_vseller' },
      _sum: { fee: true },
    });
    const sa = await prisma.sparkAccount.findMany({ where: { brandId: BRAND_ID }, select: { weekCost: true, monthCost: true, partnerSnapshotAt: true } });
    const weekCost = sa.reduce((s, a) => s + Number(a.weekCost ?? 0), 0);
    const monthCost = sa.reduce((s, a) => s + Number(a.monthCost ?? 0), 0);
    console.log(`旧项目累计(2025-01-01~2026-09-24 乐允导出): ¥${r2(legacyFee)}`);
    console.log(`partner 日存档累计(09-25起): ¥${r2(Number(partnerAll._sum.fee ?? 0))}`);
    console.log(`partner 月口径快照合计: ¥${r2(monthCost)} | 周口径: ¥${r2(weekCost)}`);
    console.log(`xlsx 全期(2026-01-07~09-28): ¥${r2(xsTotal.fee)}`);
    console.log('\n差异归因提示:');
    console.log(' 1) 快照时点: xlsx 累计截至 09-28，库内旧快照截至 09-24 → 已有笔记数值应普遍增大（自然增长，非口径错误）');
    console.log(' 2) 渠道口径: partner=乐允子账户投放全量（含未回传笔记归属的消耗），xlsx=按笔记归属的投放明细 → 重叠窗口若 partner>xlsx，差额多为「未归属到笔记的消耗/官号投放」');
    console.log(' 3) 排除规则: partner 同步排除关键词「官号投放,官方」，xlsx 若含官号行会略偏大');
    console.log(' 4) 舍入: xlsx 消费为浮点累加，partner 为平台侧金额，存在分位级差异属正常');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('比对失败:', e);
  process.exit(1);
});
