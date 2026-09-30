#!/usr/bin/env node
// 特斯拉周度快照导入（brandId=6）：客户周度表（含投流明细）→ KoxWeeklySnapshot
// 口径：总留资（未去重）= 总私信留资数 + 服务卡留资 + 预约组件留资 + 个微复制留资
// 用法:
//   node import-tesla-weekly.js                     # 导入 tesla/ 下两张周度表（按文件名 0914/0921 识别周期）
//   node import-tesla-weekly.js --dry-run           # 只统计不写库
//   node import-tesla-weekly.js --file <xlsx路径> --sheet <sheet名> --week 2026-09-14:2026-09-20
//     （显式模式可重复传多组 --file/--sheet/--week；服务器上文件名无需中文）
// 幂等：每周 deleteMany + createMany
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const XLSX = createRequire(path.join(ROOT, 'frontend', 'noop.js'))('xlsx');
const { PrismaClient } = createRequire(path.join(ROOT, 'backend', 'noop.js'))('@prisma/client');
const BRAND_ID = 6;
const DRY_RUN = process.argv.includes('--dry-run');

function parseArgsTargets() {
  const targets = [];
  const idxOf = (flag, from = 0) => process.argv.indexOf(flag, from);
  let i = idxOf('--file');
  while (i > -1) {
    const file = process.argv[i + 1];
    const sheetIdx = idxOf('--sheet', i);
    const weekIdx = idxOf('--week', i);
    const nextFile = idxOf('--file', i + 1);
    const sheet = sheetIdx > -1 && (nextFile === -1 || sheetIdx < nextFile) ? process.argv[sheetIdx + 1] : null;
    const week = weekIdx > -1 && (nextFile === -1 || weekIdx < nextFile) ? process.argv[weekIdx + 1] : null;
    if (file && week) targets.push({ file, sheet, explicitWeek: week });
    i = idxOf('--file', i + 1);
  }
  return targets;
}

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '0').replace(/[,，\s]/g, '')) || 0);

// 文件名 → 周周期（0914-0920 → 09-14 ~ 09-20，年取文件 mtime 年）
function weekOf(fileName) {
  const m = fileName.match(/(\d{4})-(\d{4})/);
  if (!m) return null;
  const year = fs.statSync(path.join(ROOT, 'tesla', fileName)).mtime.getFullYear();
  const mm = (s) => `${String(s).slice(0, 2)}-${String(s).slice(2)}`;
  const start = new Date(`${year}-${mm(m[1])}T00:00:00.000+08:00`);
  const end = new Date(`${year}-${mm(m[2])}T23:59:59.999+08:00`);
  return { start, end, startKey: `${year}-${mm(m[1])}`, endKey: `${year}-${mm(m[2])}` };
}

function weekOfExplicit(spec) {
  const [s, e] = String(spec).split(':');
  if (!s || !e) return null;
  return {
    start: new Date(`${s}T00:00:00.000+08:00`),
    end: new Date(`${e}T23:59:59.999+08:00`),
    startKey: s,
    endKey: e,
  };
}

function readWeekly(file, sheetName) {
  const wb = XLSX.readFile(file, { cellDates: true });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const explicit = parseArgsTargets();
    let targets = explicit.map((t) => ({
      file: path.resolve(t.file),
      sheet: t.sheet,
      week: weekOfExplicit(t.explicitWeek),
      label: path.basename(t.file),
    }));
    if (!explicit.length) {
      const defaults = [
        { file: '0914-0920特斯拉周度数据（含投流）.xlsx', sheet: 'Sheet1' },
        { file: '0921-0927小红书周度数据（含投流）.xlsx', sheet: '周报' },
      ];
      targets = defaults
        .filter((d) => fs.existsSync(path.join(ROOT, 'tesla', d.file)))
        .map((d) => ({ file: path.join(ROOT, 'tesla', d.file), sheet: d.sheet, week: weekOf(d.file), label: d.file }));
    }
    for (const t of targets) {
      if (!t.week) {
        console.log(`（${t.label} 周期无法识别，跳过）`);
        continue;
      }
      if (!fs.existsSync(t.file)) {
        console.log(`（缺少 ${t.label}，跳过）`);
        continue;
      }
      const week = t.week;
      const rows = readWeekly(t.file, t.sheet);
      const records = [];
      for (const r of rows) {
        const name = String(r['账号名称'] ?? '').trim();
        if (!name) continue;
        records.push({
          brandId: BRAND_ID,
          weekStart: week.start,
          weekEnd: week.end,
          uid: r['账号uid'] ? String(r['账号uid']).trim() : null,
          accountName: name,
          accountType: r['账号类型'] ? String(r['账号类型']).trim() : null,
          regionName: r['区域'] ? String(r['区域']).trim() : null,
          storeName: r['门店'] ? String(r['门店']).trim() : null,
          tierLabel: r['留资分层'] ? String(r['留资分层']).trim() : null,
          certifyUser: r['认证人'] ? String(r['认证人']).trim() : null,
          publishNotes: num(r['发布笔记数']),
          promotedNotes: num(r['投流笔记数']),
          spend: num(r['笔记投流消耗']),
          interaction: num(r['总互动数']),
          exposure: num(r['笔记曝光量']),
          clicks: num(r['笔记点击量']),
          inquiries: num(r['总私信进线']),
          openings: num(r['总私信开口数']),
          totalLeads: num(r['总留资（未去重）']),
          pmLeads: num(r['总私信留资数']),
          serviceCardLeads: num(r['服务卡留资']),
          appointmentLeads: num(r['预约组件留资']),
          wecomCopyLeads: num(r['个微复制留资']),
        });
      }
      const sum = (f) => records.reduce((s, x) => s + f(x), 0);
      console.log(
        `${week.startKey}~${week.endKey}: 账号 ${records.length}，消耗 ${sum((x) => x.spend).toFixed(2)}，进线 ${sum((x) => x.inquiries)}，开口 ${sum((x) => x.openings)}，总留资 ${sum((x) => x.totalLeads)}，私信留资 ${sum((x) => x.pmLeads)}`,
      );
      if (DRY_RUN) continue;
      await prisma.koxWeeklySnapshot.deleteMany({
        where: { brandId: BRAND_ID, weekStart: week.start },
      });
      for (let i = 0; i < records.length; i += 100) {
        await prisma.koxWeeklySnapshot.createMany({ data: records.slice(i, i + 100) });
      }
      console.log(`  已入库 ${records.length} 条`);
    }
    const total = await prisma.koxWeeklySnapshot.count({ where: { brandId: BRAND_ID } });
    console.log(`\n=== 完成 === brand ${BRAND_ID} 周度快照共 ${total} 条${DRY_RUN ? '（dry-run 未写库）' : ''}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
