#!/usr/bin/env node
// 特斯拉账号-大区对应关系按《投放数据源.xlsx》刷新（brandId=6）
// 来源：tesla/特斯拉投放数据源.xlsx《投放数据》sheet（每行自带 区域/昵称，09-30 导出，比 0924 对照表新）
// 规则：每账号取区域众数 → 归一（去"大区/区域"后缀、匹配已知大区表）→ 覆盖 KosAccount.regionName
//       "全国/托管/空"等无意义值保留库内现值；新账号（库中无）跳过（由 import-tesla-source.js 负责建）
// 用法: node refresh-tesla-region-xlsx.js --dry-run
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const BRAND_ID = 6;
const DRY_RUN = process.argv.includes('--dry-run');
const fileIdx = process.argv.indexOf('--file');
const FILE = fileIdx > -1 ? path.resolve(process.argv[fileIdx + 1]) : path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());
const REGION_VALID = new Set([
  '上海', '苏皖', '北京', '山东', '浙江', '西北', '西一', '西二', '湖北', '湘赣',
  '华北', '广东', '福建', '东北', '华中', '西区', '南区',
]);
const normalizeRegion = (v) => {
  const s = cell(v).replace(/大区|区域/g, '').trim();
  if (!s || s === '全国' || s === '托管') return null;
  const base = REGION_VALID.has(s) ? s : s.replace(/区$/, '');
  return REGION_VALID.has(base) ? `${base}区` : null;
};

(async () => {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  const regionVotes = new Map(); // 昵称 -> Map(归一区域 -> 票数)
  for (const r of rows) {
    const nick = cell(r['昵称']);
    const region = normalizeRegion(r['区域']);
    if (!nick || !region) continue;
    if (!regionVotes.has(nick)) regionVotes.set(nick, new Map());
    const m = regionVotes.get(nick);
    m.set(region, (m.get(region) ?? 0) + 1);
  }
  const regionByNick = new Map();
  for (const [nick, m] of regionVotes) {
    regionByNick.set(nick, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  console.log(`xlsx 账号-区域关系: ${regionByNick.size} 个账号（有效大区）`);

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, nickname: true, regionName: true },
    });
    let updated = 0;
    let same = 0;
    const changes = [];
    for (const a of accounts) {
      const next = regionByNick.get(a.nickname);
      if (!next || next === a.regionName) { same += 1; continue; }
      changes.push({ nick: a.nickname, from: a.regionName, to: next });
      if (!DRY_RUN) {
        await prisma.kosAccount.update({ where: { id: a.id }, data: { regionName: next } });
      }
      updated += 1;
    }
    console.log(`${DRY_RUN ? '[dry] ' : ''}区域更新: ${updated} 个账号（${same} 个无变化/无对应）`);
    for (const c of changes.slice(0, 30)) console.log(`  ${c.nick}: ${c.from ?? '(空)'} → ${c.to}`);
    if (changes.length > 30) console.log(`  ...等共 ${changes.length} 处变更`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
