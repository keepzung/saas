#!/usr/bin/env node
// 荣威账号来源(source)回填：
//   roster = 客户账号清单 UID 集合内的账号（运营总览 KOS/KOB/KOC 计数口径）
//   auto   = 2026-10-15 之后创建（星火同步自动注册）
//   legacy = 其余（旧清单遗留）
// 用法: node mark-account-source.js [--dry-run] [--file <sheet2 xlsx>]

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const fileIdx = process.argv.indexOf('--file');
const DIR = path.join(ROOT, 'roewe');
const FILE =
  fileIdx > -1 && process.argv[fileIdx + 1]
    ? path.resolve(process.argv[fileIdx + 1])
    : path.join(DIR, fs.readdirSync(DIR).find((x) => x.startsWith('sheet2') && x.endsWith('.xlsx')) || '');

const BRAND_ID = Number(process.env.BRAND_ID || 2);
const AUTO_CUTOFF = new Date('2026-10-15T00:00:00+08:00'); // 自动注册功能上线日

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`未找到清单文件: ${FILE}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['账号清单'], { defval: null });
  const rosterUids = new Set();
  for (const r of rows) {
    for (const col of ['主账户ID', '主账户ID_1']) {
      const id = String(r[col] || '').trim();
      if (id) rosterUids.add(id);
    }
  }
  console.log(`清单 UID: ${rosterUids.size} 个`);

  const prisma = new PrismaClient();
  const stat = { roster: 0, auto: 0, legacy: 0 };
  try {
    const accs = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, authorId: true, createdAt: true, source: true },
    });
    for (const a of accs) {
      let source;
      if (rosterUids.has(a.authorId)) source = 'roster';
      else if (a.createdAt >= AUTO_CUTOFF) source = 'auto';
      else source = 'legacy';
      if (a.source === source) continue;
      stat[source] += 1;
      if (!DRY_RUN) {
        await prisma.kosAccount.update({ where: { id: a.id }, data: { source } });
      }
    }
    console.log(`=== 完成${DRY_RUN ? '（dry-run）' : ''} === roster=${stat.roster} / auto=${stat.auto} / legacy=${stat.legacy}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('回填失败:', e.message || e);
  process.exit(1);
});
