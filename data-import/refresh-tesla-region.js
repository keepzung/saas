#!/usr/bin/env node
// 特斯拉 192 账号大区刷新（brandId=6）
// 来源：tesla/特斯拉大区刷新对照表0924.xlsx 分KOS sheet
// 匹配：按 账号名称 精确匹配 KosAccount.nickname（对照表内无重名）
// 回填：regionName=大区更新 / areaName=省·市 / storeName=门店 / accountTag=账号类型 / authorUrl=账号链接
// 说明：不改 authorId（tesla_<md5> 前缀保持稳定，避免与 import-tesla.js 重跑 upsert 冲突）
// 用法:
//   node refresh-tesla-region.js --file <xlsx>            （写入）
//   node refresh-tesla-region.js --file <xlsx> --dry-run  （只比对不写库）
//   node refresh-tesla-region.js --file <xlsx> --brand 6  （默认 brand 6）
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
const FILE = fileIdx > -1 ? path.resolve(process.argv[fileIdx + 1]) : path.resolve(__dirname, '../tesla/特斯拉大区刷新对照表0924.xlsx');
const brandIdx = process.argv.indexOf('--brand');
const BRAND_ID = brandIdx > -1 ? Number(process.argv[brandIdx + 1]) : 6;

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`文件不存在: ${FILE}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['分KOS'] ?? wb.Sheets[wb.SheetNames[0]], { defval: null });
  console.log(`对照表: ${rows.length} 行（brand ${BRAND_ID}）`);

  const parsed = rows
    .map((r) => ({
      nickname: cell(r['账号名称']),
      regionName: cell(r['大区更新']) || null,
      areaName: (() => {
        const prov = cell(r['省份']);
        const city = cell(r['城市']);
        if (!prov || prov === '全国') return prov || null;
        return city && city !== prov ? `${prov}·${city}` : prov;
      })(),
      storeName: cell(r['门店']) || null,
      accountTag: cell(r['账号类型']) || null,
      authorUrl: cell(r['账号链接']) || null,
    }))
    .filter((r) => r.nickname);

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, nickname: true, regionName: true, areaName: true, storeName: true, accountTag: true, authorUrl: true },
    });
    const byName = new Map(accounts.map((a) => [a.nickname, a]));

    let matched = 0;
    let changed = 0;
    let unchanged = 0;
    const missing = [];
    const diff = (field, now, next) => (now ?? null) !== next && (now ?? '') !== next;
    const updates = [];
    for (const p of parsed) {
      const acc = byName.get(p.nickname);
      if (!acc) {
        missing.push(p.nickname);
        continue;
      }
      matched += 1;
      const next = {
        regionName: p.regionName,
        areaName: p.areaName,
        storeName: p.storeName,
        accountTag: p.accountTag,
        authorUrl: p.authorUrl,
      };
      const dirty =
        diff('regionName', acc.regionName, next.regionName) ||
        diff('areaName', acc.areaName, next.areaName) ||
        diff('storeName', acc.storeName, next.storeName) ||
        diff('accountTag', acc.accountTag, next.accountTag) ||
        diff('authorUrl', acc.authorUrl, next.authorUrl);
      if (dirty) {
        changed += 1;
        updates.push({ id: acc.id, nickname: acc.nickname, ...next });
      } else {
        unchanged += 1;
      }
    }

    const tagStat = {};
    for (const p of parsed) {
      if (p.accountTag) tagStat[p.accountTag] = (tagStat[p.accountTag] ?? 0) + 1;
    }
    const regionStat = {};
    for (const p of parsed) {
      if (p.regionName) regionStat[p.regionName] = (regionStat[p.regionName] ?? 0) + 1;
    }
    console.log(`账号类型分布: ${JSON.stringify(tagStat)}`);
    console.log(`大区分布: ${JSON.stringify(regionStat)}`);
    console.log(`匹配 ${matched}/${parsed.length}，待更新 ${changed}，无变化 ${unchanged}，未匹配 ${missing.length}`);
    if (missing.length) console.log(`未匹配名单: ${missing.join('、')}`);

    if (DRY_RUN) {
      console.log('--dry-run：未写库。样例变更:', JSON.stringify(updates.slice(0, 3), null, 2));
      return;
    }
    for (const u of updates) {
      const { id, nickname, ...data } = u;
      await prisma.kosAccount.update({ where: { id }, data });
    }
    console.log(`入库完成: 更新 ${updates.length} 条`);

    const [total, regionGroups] = await Promise.all([
      prisma.kosAccount.count({ where: { brandId: BRAND_ID } }),
      prisma.kosAccount.groupBy({ by: ['regionName'], where: { brandId: BRAND_ID }, _count: { _all: true } }),
    ]);
    console.log(`=== 完成 === brand ${BRAND_ID} 账号 ${total}，大区 ${regionGroups.length} 组: ${regionGroups.map((g) => `${g.regionName ?? '(空)'}:${g._count._all}`).join(' / ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('刷新失败:', e);
  process.exit(1);
});
