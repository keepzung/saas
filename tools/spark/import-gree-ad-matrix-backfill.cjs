#!/usr/bin/env node
// 格力员工矩阵历史回填（9-01~11-03）+ 聚光笔记级明细底表导入
// 数据源：《格力小红书笔记推进表》「（9,10,11）投放数据源」sheet（已聚合为 noteId×day）
// 写入两张表：
//   1) GreeAdNoteDaily      —— 全量明细（含 11-04 之后，仅作底表/交叉验证，不碰平台数据）
//   2) SparkStaffUserDaily  —— 仅 9-01~11-03 断档期，且只写投放侧字段：
//      rtbNoteNum/rtbIncomeAmt/adsReadCnt（口径天然=投放）；messageOpenCnt/msgLeadsNum 填投放口径值
//      （来源与口径写进 rawJson）；createNoteNum 用库里平台笔记日数据；粉丝/社媒/自然字段留 0
//      11-04 起平台已有权威分区，绝不覆盖。幂等可重跑（upsert）。
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/noop.js');
const { PrismaClient } = backendRequire('@prisma/client');
const { Decimal } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

const BRAND = 8;
const CUT = '2026-11-04'; // 员工矩阵回填只处理 < CUT 的天
const DATA_PATH = process.argv[2] || '/opt/saas/tools/spark/gree_ad_note_daily_9to11.json';

const dayOf = (s) => new Date(`${s}T00:00:00.000Z`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`明细行=${rows.length}`);
  const t0 = Date.now();

  // ── 1) 明细底表 GreeAdNoteDaily（全量，幂等 upsert）──
  let detailUpserted = 0;
  for (const r of rows) {
    await prisma.greeAdNoteDaily.upsert({
      where: { brandId_noteId_day: { brandId: BRAND, noteId: r.noteId, day: dayOf(r.day) } },
      create: {
        brandId: BRAND, day: dayOf(r.day), noteId: r.noteId,
        sellerName: r.sellerName || null, sellerId: r.sellerId || null, authorId: r.authorId || null,
        fee: new Decimal(Number(r.fee.toFixed(2))),
        impression: r.imp, click: r.click, interaction: r.interact,
        pmInquiries: r.pmInq, pmOpenings: r.pmOpen, pmLeads: r.pmLead,
        pmOpenMsgs: r.pmOpenMsg, pmInqUsers: r.pmInqUser,
        resp15s: r.resp15, reply30s: r.reply30, reply1min: r.reply60,
      },
      update: {
        sellerName: r.sellerName || null, sellerId: r.sellerId || null, authorId: r.authorId || null,
        fee: new Decimal(Number(r.fee.toFixed(2))),
        impression: r.imp, click: r.click, interaction: r.interact,
        pmInquiries: r.pmInq, pmOpenings: r.pmOpen, pmLeads: r.pmLead,
        pmOpenMsgs: r.pmOpenMsg, pmInqUsers: r.pmInqUser,
        resp15s: r.resp15, reply30s: r.reply30, reply1min: r.reply60,
      },
    });
    detailUpserted += 1;
    if (detailUpserted % 1000 === 0) console.log(`明细 ${detailUpserted}/${rows.length}`);
  }
  console.log(`GreeAdNoteDaily upsert 完成: ${detailUpserted}`);

  // ── 2) 作者 → 员工模板映射 ──
  const accounts = await prisma.kosAccount.findMany({
    where: { brandId: BRAND }, select: { id: true, nickname: true, authorId: true },
  });
  const acctByAuthorId = new Map();
  const acctByNickname = new Map();
  for (const a of accounts) {
    if (a.authorId) acctByAuthorId.set(a.authorId, a);
    if (a.nickname) acctByNickname.set(a.nickname, a);
  }
  const tmplRows = await prisma.sparkStaffUserDaily.findMany({
    where: { brandId: BRAND, statDate: { gte: new Date('2026-11-01T00:00:00.000Z') } },
    orderBy: { statDate: 'desc' },
  });
  const tmplByNickname = new Map();
  const tmplByStaffName = new Map();
  for (const t of tmplRows) {
    const k = (t.nickname || '').trim();
    if (k && !tmplByNickname.has(k)) tmplByNickname.set(k, t);
    const k2 = (t.staffName || '').trim();
    if (k2 && !tmplByStaffName.has(k2)) tmplByStaffName.set(k2, t);
  }

  // ── 3) 员工×日聚合（只取 day < CUT）──
  const authorDay = new Map(); // authorId|day -> {fee, imp, pmOpen, pmLead, notes:Set}
  for (const r of rows) {
    if (r.day >= CUT) continue;
    if (!r.authorId) continue;
    const key = `${r.authorId}|${r.day}`;
    let a = authorDay.get(key);
    if (!a) { a = { fee: 0, imp: 0, pmOpen: 0, pmLead: 0, notes: new Set() }; authorDay.set(key, a); }
    a.fee += r.fee; a.imp += r.imp; a.pmOpen += r.pmOpen; a.pmLead += r.pmLead;
    a.notes.add(r.noteId);
  }
  console.log(`回填范围 员工×日 组合=${authorDay.size} (< ${CUT})`);

  // createNoteNum 来自库里平台笔记日数据（accountId+day）
  const nds = await prisma.koxNoteDailyStat.groupBy({
    by: ['accountId', 'day'],
    where: {
      brandId: BRAND, accountId: { not: null },
      day: { gte: dayOf('2026-09-01'), lt: dayOf(CUT) },
    },
    _count: { _all: true },
  });
  const noteCnt = new Map(); // accountId|dayISO -> count
  for (const g of nds) noteCnt.set(`${g.accountId}|${g.day.toISOString().slice(0, 10)}`, g._count._all);

  // ── 4) 写 SparkStaffUserDaily ──
  let matrixRows = 0;
  const unmapped = new Map();
  for (const [key, a] of authorDay) {
    const [authorId, dayStr] = key.split('|');
    const acct = acctByAuthorId.get(authorId) || null;
    const nick = acct ? (acct.nickname || '').trim() : '';
    const tmpl = (nick && tmplByNickname.get(nick)) || (acct && tmplByStaffName.get((acct.nickname || '').trim())) || null;
    if (!tmpl) {
      unmapped.set(authorId, (unmapped.get(authorId) || 0) + 1);
      continue;
    }
    const accountId = acct ? acct.id : null;
    const cNote = accountId ? (noteCnt.get(`${accountId}|${dayStr}`) || 0) : 0;
    const statDate = dayOf(dayStr);
    const data = {
      brandUserId: tmpl.brandUserId || '',
      brandUserName: tmpl.brandUserName || null,
      staffName: tmpl.staffName || null,
      nickname: tmpl.nickname || null,
      accountType: tmpl.accountType || null,
      bindDate: tmpl.bindDate || null,
      staffArea: tmpl.staffArea || null,
      staffLabel: tmpl.staffLabel || null,
      rtbNoteNum: a.notes.size,
      rtbIncomeAmt: new Decimal(Number(a.fee.toFixed(2))),
      adsReadCnt: a.imp,
      createNoteNum: cNote,
      messageOpenCnt: a.pmOpen, // 投放口径（来源见 rawJson）
      msgLeadsNum: a.pmLead,    // 投放口径
      rawJson: {
        source: 'excel_推进表_投放数据源_20261120',
        caliber: 'rtb/ads=聚光投放口径; messageOpenCnt/msgLeadsNum=投放口径(非全量); fans/soc未回溯',
        noteCnt: a.notes.size,
      },
    };
    await prisma.sparkStaffUserDaily.upsert({
      where: { statDate_userId_brandId: { statDate, userId: tmpl.userId, brandId: BRAND } },
      create: { statDate, userId: tmpl.userId, brandId: BRAND, ...data },
      update: data,
    });
    matrixRows += 1;
    if (matrixRows % 200 === 0) console.log(`矩阵 ${matrixRows}/${authorDay.size}`);
    await sleep(5);
  }
  console.log(`SparkStaffUserDaily 回填完成: ${matrixRows} 行 (员工×日)`);
  if (unmapped.size) {
    console.log('未映射作者ID(无员工模板,仅入明细底表):');
    for (const [k, v] of unmapped) console.log(`  ${k} ×${v}天`);
  }
  console.log(`总耗时 ${Math.round((Date.now() - t0) / 1000)}s`);
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
