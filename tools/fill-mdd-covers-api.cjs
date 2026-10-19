#!/usr/bin/env node
// 一次性: MDD(5) 缺封面笔记批量补齐——MCC 笔记分析 first_file_id → sns-img CDN 直链 (纯 API, 不触发反爬; 跑完即删)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.env.BACKEND_DIR || '/opt/saas/backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();
const MCC = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function noteDetailList(cookie, body) {
  const res = await fetch(MCC + '/api/vision/mcc_dashboard/target_detail_list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'User-Agent': UA, Origin: MCC, Referer: MCC + '/micro/note-data' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j?.code !== 0) throw new Error('vision err: ' + String(j?.msg ?? '').slice(0, 80));
  const vo = j?.data?.detailListVo ?? {};
  return { total: vo.total ?? 0, rows: vo.detailVoList ?? vo.detailDataList ?? [] };
}

// 从行提取 targetCode 值（targetList 数组结构，同 staffRowMap）
function rowMap(r) {
  const m = new Map();
  for (const t of r.targetList ?? []) {
    const v = t.targetValue ?? t.targetOriginValue ?? t.targetDownloadValue;
    if (v != null && v !== '') m.set(String(t.targetCode), v);
  }
  return m;
}

(async () => {
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: 5 } });
  if (!cfg?.cookie) throw new Error('brand5 无 MCC cookie');
  const DRY = !process.argv.includes('--doit');
  const missing = await prisma.koxNote.findMany({
    where: { brandId: 5, OR: [{ coverUrl: null }, { coverUrl: '' }] },
    select: { noteId: true },
  });
  const need = new Set(missing.map((x) => x.noteId));
  console.log('缺封面笔记:', need.size, DRY ? '(dry)' : '');

  // 全量分页拉笔记行（含 first_file_id），提取 noteId → 封面 URL
  const coverByNote = new Map();
  let total = 0;
  const targets = ['note_id', 'first_file_id', 'note_title'];
  for (let pageNo = 1; pageNo <= 120; pageNo++) {
    const { total: t, rows } = await noteDetailList(cfg.cookie, {
      viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
      chart: 'noteList',
      dynamicTargets: targets,
      sorts: [],
      page: { pageNo, pageSize: 100 },
      frontFilterList: [
        { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ selected: 1, labelValue: 'all_key', labelName: '合计' }] } },
        { filterField: 'date_key', filterFieldName: '笔记数据范围', filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, disableRange: 0, limitMax: 366, quickDates: [6, 16, 21, 36, 41, 46, 51], values: ['2026-01-01', '2026-10-19'] } },
      ],
    });
    total = t;
    for (const r of rows) {
      const m = rowMap(r);
      const noteId = String(m.get('note_id') ?? '');
      const fid = String(m.get('first_file_id') ?? '');
      if (noteId && fid && need.has(noteId)) {
        coverByNote.set(noteId, `https://sns-img-qc.xhscdn.com/${fid}?imageView2/2/w/480/format/jpg`);
      }
    }
    if (rows.length >= t || !rows.length) break;
  }
  console.log(`拉取 ${total} 行，命中缺封面 ${coverByNote.size}/${need.size}`);
  if (DRY) { console.log('DRY-RUN'); await prisma.$disconnect(); return; }
  let n = 0;
  for (const [noteId, url] of coverByNote) {
    await prisma.koxNote.update({ where: { noteId }, data: { coverUrl: url } });
    n++;
    if (n % 200 === 0) console.log('updated', n);
  }
  const left = await prisma.koxNote.count({ where: { brandId: 5, OR: [{ coverUrl: null }, { coverUrl: '' }] } });
  console.log(`完成: 写入 ${n}，剩余缺封面 ${left}`);
  await prisma.$disconnect();
})().catch((e) => { console.error('FAIL', String(e).slice(0, 300)); process.exit(1); });
