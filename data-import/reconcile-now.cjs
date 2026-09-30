#!/usr/bin/env node
// 特斯拉《投放数据源.xlsx》vs 网站数据库 全面对账（brandId=6，只读）
// 维度：投流日聚合 / 周度快照 / 笔记覆盖 / 账号覆盖 / 笔记累计口径抽查
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');
const LABEL = process.argv[2] || 'DB';

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(v * 100) / 100;

(async () => {
  const wb = XLSX.readFile(path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx'), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  const leadRows = XLSX.utils.sheet_to_json(wb.Sheets['专业号留资数据'], { defval: null });
  const cell = (v) => (v == null ? '' : String(v).trim());
  const dayKey = (d) => (d instanceof Date ? new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10) : null);

  // xlsx 全期聚合
  const x = { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0, notes: new Set(), authors: new Set() };
  const xNoteAgg = new Map(); // noteId -> cumulative
  for (const r of rows) {
    x.fee += num(r['消费']); x.imp += num(r['展现量']); x.click += num(r['点击量']); x.inter += num(r['互动量']);
    x.inq += num(r['私信进线数']); x.open += num(r['私信开口数']); x.leads += num(r['私信留资数']);
    const nid = cell(r['笔记ID']); if (nid) x.notes.add(nid);
    const aid = cell(r['作者ID']); if (aid) x.authors.add(aid);
    if (nid) {
      const cur = xNoteAgg.get(nid) ?? { imp: 0, click: 0 };
      cur.imp += num(r['展现量']); cur.click += num(r['点击量']);
      xNoteAgg.set(nid, cur);
    }
  }
  const xLeadTotal = leadRows.reduce((s, r) => s + num(r['总留资']), 0);

  const prisma = new PrismaClient();
  const out = { label: LABEL };
  try {
    // 1) 投流日聚合
    const camp = await prisma.koxCampaignDailyStat.findMany({
      where: { brandId: 6, accountKind: 'kos_author', statDate: { gte: new Date('2026-01-07T00:00:00+08:00'), lte: new Date('2026-09-28T23:59:59+08:00') } },
      select: { fee: true, impression: true, click: true, interaction: true, messageConsult: true, msgChatUserCnt: true, msgLeadsNum: true },
    });
    const c = camp.reduce((a, r) => ({ fee: a.fee + Number(r.fee), imp: a.imp + r.impression, click: a.click + r.click, inter: a.inter + r.interaction, inq: a.inq + r.messageConsult, open: a.open + r.msgChatUserCnt, leads: a.leads + r.msgLeadsNum }), { fee: 0, imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 });
    out.campaign = {
      xlsx: { fee: r2(x.fee), imp: x.imp, click: x.click, inter: x.inter, inq: x.inq, open: x.open, leads: x.leads },
      db: { fee: r2(c.fee), imp: c.imp, click: c.click, inter: c.inter, inq: c.inq, open: c.open, leads: c.leads, rows: camp.length },
      match: r2(x.fee) === r2(c.fee) && x.imp === c.imp && x.leads === c.leads,
    };

    // 2) 周度快照
    const wk = await prisma.koxWeeklySnapshot.aggregate({ where: { brandId: 6, weekStart: { gte: new Date('2026-01-07T00:00:00+08:00'), lte: new Date('2026-09-23T00:00:00+08:00') } }, _sum: { totalLeads: true, inquiries: true, exposure: true }, _count: true });
    const wkWeeks = await prisma.koxWeeklySnapshot.groupBy({ by: ['weekStart'], where: { brandId: 6, weekStart: { gte: new Date('2026-01-07T00:00:00+08:00'), lte: new Date('2026-09-23T00:00:00+08:00') } } });
    const weekOverlap = leadRows.length ? [...new Set(leadRows.map((r) => dayKey(r['当周开始'])).filter(Boolean))] : [];
    out.weekly = { dbRows: wk._count, dbWeeks: wkWeeks.length, xlsxWeeks: weekOverlap.length, dbTotalLeads: wk._sum.totalLeads ?? 0, xlsxTotalLeads: xLeadTotal, match: wk._sum.totalLeads === xLeadTotal };

    // 3) 笔记覆盖
    const noteIds = [...x.notes];
    const dbNotes = await prisma.koxNote.findMany({ where: { brandId: 6, noteId: { in: noteIds } }, select: { noteId: true, exposure: true, views: true } });
    const dbSet = new Set(dbNotes.map((n) => n.noteId));
    const missing = noteIds.filter((id) => !dbSet.has(id));
    out.notes = { xlsx: noteIds.length, inDb: dbSet.size, removed: missing.length };

    // 4) 笔记累计口径抽查（DB 应 >= xlsx 全期累计，因 DB 含 2025 历史）
    let geCount = 0; let ltCount = 0; let checked = 0;
    for (const n of dbNotes) {
      const xa = xNoteAgg.get(n.noteId);
      if (!xa) continue;
      checked += 1;
      if (n.exposure >= xa.imp - 1) geCount += 1; else ltCount += 1;
    }
    out.noteCum = { checked, dbGteXlsx: geCount, dbLtXlsx: ltCount };

    // 5) 账号覆盖
    const accs = await prisma.kosAccount.count({ where: { brandId: 6 } });
    out.accounts = { xlsx: x.authors.size, dbTotal: accs };

    console.log(`\n===== 对账报告 [${LABEL}] =====`);
    console.log('1) 投流日聚合(kos_author): ' + (out.campaign.match ? '✅ 完全一致' : '❌ 有差异'));
    console.log('   xlsx: fee=' + out.campaign.xlsx.fee + ' imp=' + out.campaign.xlsx.imp + ' leads=' + out.campaign.xlsx.leads);
    console.log('   db:   fee=' + out.campaign.db.fee + ' imp=' + out.campaign.db.imp + ' leads=' + out.campaign.db.leads + ' (' + out.campaign.db.rows + ' 行)');
    console.log('2) 周度快照: ' + (out.weekly.match ? '✅ 总留资一致' : '❌ 有差异') + ' db ' + out.weekly.dbWeeks + '周/' + out.weekly.dbRows + '行 总留资=' + out.weekly.dbTotalLeads + ' vs xlsx ' + out.weekly.xlsxWeeks + '周 总留资=' + out.weekly.xlsxTotalLeads);
    console.log('3) 笔记覆盖: xlsx ' + out.notes.xlsx + ' 篇，库中 ' + out.notes.inDb + '，已删(站内不可见) ' + out.notes.removed);
    console.log('4) 笔记累计口径: 抽查 ' + out.noteCum.checked + ' 篇，DB≥xlsx ' + out.noteCum.dbGteXlsx + '（含2025历史，正常）/' + out.noteCum.dbLtXlsx + ' 篇 DB<xlsx' + (out.noteCum.dbLtXlsx ? ' ⚠️' : ''));
    console.log('5) 账号: xlsx ' + out.accounts.xlsx + ' 作者，库中账号 ' + out.accounts.dbTotal);
  } finally {
    await prisma.$disconnect();
  }
  fs.writeFileSync(path.join(__dirname, 'reconcile-' + LABEL + '.json'), JSON.stringify(out, null, 1), 'utf8');
})().catch((e) => { console.error(e); process.exit(1); });
