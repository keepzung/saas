#!/usr/bin/env node
// 东风 KOS 账号导入脚本（约 790 账号，含大区 / 销售区域 / 店名）
// 用法:
//   node import-dongfeng.js --file 东风账号导入表.xlsx --dry-run
//   node import-dongfeng.js --file 东风账号导入表.xlsx            （导入 + 生成占位排行数据）
//   node import-dongfeng.js --file 东风账号导入表.xlsx --no-stats （仅导入账号）
// 表头自动识别（支持常见命名），未识别列将打印表头供确认。

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const NO_STATS = process.argv.includes('--no-stats');
const fileArgIdx = process.argv.indexOf('--file');
const FILE =
  fileArgIdx > -1 && process.argv[fileArgIdx + 1]
    ? path.resolve(process.argv[fileArgIdx + 1])
    : path.join(__dirname, '东风账号导入表.xlsx');

const BRAND_ID = Number(process.env.BRAND_ID || 2); // 东风品牌
const PLATFORM_DEFAULT = 'xhs';

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());
const clean = (v) => {
  const s = cell(v);
  return s && s !== '无' && s !== '/' && s !== '-' ? s : null;
};

// 表头关键词 → 字段映射（按优先级匹配）
const HEADER_MAP = [
  { field: 'authorId', keys: ['uid', '账号id', '账号id_', '作者id', '主页id', 'sec_uid', 'secuid'] },
  { field: 'authorUrl', keys: ['链接', 'url', '主页', '地址'] },
  { field: 'accountType', keys: ['账号类型', '类型', 'accounttype'] },
  { field: 'regionName', keys: ['大区', '汇总区域', '区域', 'region'] },
  { field: 'saleArea', keys: ['销售区域', '销售大区', 'salearea'] },
  { field: 'province', keys: ['省', '省份'] },
  { field: 'city', keys: ['市', '城市'] },
  { field: 'storeName', keys: ['店名', '门店', '店铺', '经销商', 'store'] },
  { field: 'nickname', keys: ['昵称', '账号名称', '账号名', '名称', 'nickname'] },
  { field: 'operatorName', keys: ['运营人', '运营', '负责人'] },
  { field: 'operatorMobile', keys: ['手机号', '电话', '联系方式'] },
];

function mapHeaders(headerRow) {
  const colMap = {};
  const unmatched = [];
  headerRow.forEach((raw, idx) => {
    const h = cell(raw).toLowerCase().replace(/\s+/g, '');
    if (!h) return;
    const hit = HEADER_MAP.find((m) => m.keys.some((k) => h === k || h.includes(k)));
    if (hit && !colMap[hit.field]) colMap[hit.field] = idx;
    else if (!hit) unmatched.push(cell(raw));
  });
  return { colMap, unmatched };
}

function parseWorkbook(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rows.length < 2) throw new Error('表格为空或只有表头');

  // 表头行自动探测：前 5 行中包含可识别表头的那一行
  let headerIdx = -1;
  let colMap = null;
  let unmatched = [];
  for (let i = 0; i < Math.min(5, rows.length); i += 1) {
    const m = mapHeaders(rows[i]);
    if (m.colMap.authorId != null || m.colMap.storeName != null) {
      headerIdx = i;
      colMap = m.colMap;
      unmatched = m.unmatched;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      `未识别表头，前几行内容：\n${rows
        .slice(0, 3)
        .map((r) => r.map(cell).join(' | '))
        .join('\n')}`,
    );
  }

  const out = [];
  const errors = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const r = rows[i];
    const get = (f) => (colMap[f] != null ? r[colMap[f]] : null);
    const authorId = cell(get('authorId'));
    const storeName = clean(get('storeName'));
    const nickname = clean(get('nickname')) ?? storeName;
    if (!authorId && !nickname) continue;
    if (!authorId) {
      errors.push({ row: i + 1, msg: `缺少UID（店名：${nickname ?? '-'}）` });
      continue;
    }
    const province = clean(get('province'));
    const city = clean(get('city'));
    const regionName = clean(get('regionName')) ?? province;
    const saleArea = clean(get('saleArea')) ?? clean(get('regionName'));
    const areaParts = [];
    if (province) areaParts.push(province);
    if (city && city !== province) areaParts.push(city);
    const url = cell(get('authorUrl'));
    const typeRaw = cell(get('accountType')).toUpperCase();
    const typeMatch = typeRaw.match(/KOS|KOB|KOC/);
    const type = typeMatch ? typeMatch[0] : 'KOS';
    out.push({
      authorId,
      nickname: nickname ?? `待补充-${authorId.slice(-4)}`,
      platform: /xhs|xiaohongshu/i.test(url) ? 'xhs' : PLATFORM_DEFAULT,
      accountType: ['KOS', 'KOB', 'KOC'].includes(type) ? type : 'KOS',
      regionName,
      saleArea: saleArea && saleArea !== regionName ? saleArea : null,
      areaName: areaParts.join('·') || null,
      storeName,
      operatorName: clean(get('operatorName')),
      operatorMobile: clean(get('operatorMobile')),
      authorUrl: url || null,
      status: 'enabled',
      brandId: BRAND_ID,
    });
  }
  return { accounts: out, errors, headerRow: rows[headerIdx].map(cell), unmatched };
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`文件不存在: ${FILE}`);
    console.error('请将东风账号表放入 data-import/ 并用 --file 指定路径。');
    process.exit(1);
  }
  const wb = XLSX.readFile(FILE);
  const { accounts, errors, headerRow, unmatched } = parseWorkbook(wb);

  console.log('=== 解析结果 ===');
  console.log(`表头: ${headerRow.join(' | ')}`);
  if (unmatched.length) console.log(`未匹配列（忽略）: ${unmatched.join(' | ')}`);
  console.log(`共 ${accounts.length} 条账号`);
  const regionSet = new Set(accounts.map((a) => a.regionName).filter(Boolean));
  const saleSet = new Set(accounts.map((a) => a.saleArea).filter(Boolean));
  const storeSet = new Set(accounts.map((a) => a.storeName).filter(Boolean));
  console.log(
    `维度统计: 大区 ${regionSet.size} 个 [${[...regionSet].slice(0, 8).join('、')}${regionSet.size > 8 ? '…' : ''}] | 销售区域 ${saleSet.size} 个 | 门店 ${storeSet.size} 个`,
  );
  console.log('样例:', JSON.stringify(accounts[0], null, 0));
  if (errors.length) console.log(`⚠ ${errors.length} 行有问题:\n${errors.slice(0, 10).map((e) => `  第${e.row}行 ${e.msg}`).join('\n')}`);

  const dupUids = accounts.map((a) => a.authorId).filter((v, i, arr) => arr.indexOf(v) !== i);
  if (dupUids.length) console.log(`⚠ 文件内重复 UID: ${[...new Set(dupUids)].join(', ')}`);

  if (DRY_RUN) {
    console.log('\n--dry-run：未写库，结束。');
    return;
  }

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  try {
    for (const a of accounts) {
      const { brandId, ...data } = a;
      const exist = await prisma.kosAccount.findUnique({ where: { authorId: a.authorId } });
      await prisma.kosAccount.upsert({ where: { authorId: a.authorId }, update: data, create: a });
      exist ? updated++ : created++;
    }
    const total = await prisma.kosAccount.count();
    console.log(`\n=== 完成 === 新建 ${created} / 更新 ${updated}，当前库内 KosAccount 总数=${total}`);

    if (!NO_STATS) {
      // 占位日统计：让排行榜导入后立即可见（星火采集接入后由真实数据覆盖）
      const uids = accounts.map((a) => a.authorId);
      const imported = await prisma.kosAccount.findMany({
        where: { authorId: { in: uids } },
        select: { id: true },
      });
      const haveStats = await prisma.koxAccountDailyStat.groupBy({
        by: ['accountId'],
        where: { accountId: { in: imported.map((x) => x.id) } },
      });
      const have = new Set(haveStats.map((g) => g.accountId));
      const targets = imported.filter((x) => !have.has(x.id));
      if (targets.length) {
        const day = 24 * 60 * 60 * 1000;
        const rand = (min, max) => min + Math.floor(Math.random() * (max - min));
        let statCount = 0;
        for (const acc of targets) {
          const rows = [];
          for (let i = 59; i >= 0; i--) {
            const d = new Date(Date.now() - i * day);
            d.setHours(0, 0, 0, 0);
            const w = d.getDay();
            const boost = w === 0 || w === 6 ? 1.3 : 1;
            const growth = 1 + (59 - i) * 0.005;
            const item = Math.max(0, Math.round(rand(0, 3) * boost * growth));
            const view = item * rand(2200, 5200);
            const digg = Math.floor(view * (rand(3, 9) / 100));
            rows.push({
              accountId: acc.id,
              statDate: d,
              itemCnt: item,
              crazyItemCnt: item > 2 && Math.random() < 0.1 ? 1 : 0,
              exposureSum: view * rand(8, 15),
              viewSum: view,
              diggSum: digg,
              interactionSum: digg + Math.floor(digg / rand(4, 9)),
              followCountSum: rand(10, 90),
              pmLeads: Math.random() < 0.4 ? rand(1, 6) : 0,
              toolClickCnt: Math.floor(view * 0.012),
            });
          }
          await prisma.koxAccountDailyStat.createMany({ data: rows });
          statCount += rows.length;
        }
        console.log(`[KoxAccountDailyStat] 生成占位统计 ${statCount} 条（${targets.length} 账号 × 60 天，星火接入后替换）`);
      } else {
        console.log('[KoxAccountDailyStat] 导入账号均有统计数据，跳过');
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e.message || e);
  process.exit(1);
});
