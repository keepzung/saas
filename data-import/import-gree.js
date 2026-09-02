#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const SKU_FILE = path.join(__dirname, '(Star5)格力SKU产品信息收集表(1).xlsx');
const ACCOUNT_FILE = path.join(__dirname, '格力账号导入表.xlsx');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());

function tableToMarkdown(rows) {
  const clean = rows.map((r) => r.map(cell));
  const width = Math.max(...clean.map((r) => r.length));
  const pad = (r) => {
    const out = r.slice();
    while (out.length < width) out.push('');
    return out;
  };
  const [head, ...body] = clean.map(pad);
  if (!head || clean.length === 0) return '';
  return [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
    ...body.map((r) => '| ' + r.join(' | ') + ' |'),
  ].join('\n');
}

function forwardFillFirstCol(rows) {
  let last = '';
  return rows.map((r) => {
    const row = r.slice();
    if (row[0] == null || cell(row[0]) === '') row[0] = last;
    else last = cell(row[0]);
    return row;
  });
}

function infoSheetToMarkdown(rows) {
  const data = forwardFillFirstCol(rows.slice(1));
  const lines = [];
  let currentCat = null;
  for (const r of data) {
    const cat = cell(r[0]);
    const label = cell(r[1]);
    const value = cell(r[2]);
    if (!cat && !label && !value) continue;
    if (cat !== currentCat) {
      lines.push('', '## ' + cat);
      currentCat = cat;
    }
    if (label || value) lines.push(`- **${label || '—'}**：${value || '—'}`);
  }
  return lines.join('\n').trim();
}

const PARAM_HEADERS = [
  '型号',
  '制冷量(KW)',
  '制热量(KW)',
  '噪音dB(A)全消音室',
  '电源规格',
  '额定功率·制冷(KW)',
  '额定功率·制热(KW)',
  'APF(W.h/W.h)',
  '风量(m³/h)',
  '机外静压(Pa)',
  '机组尺寸宽×深×高(mm)',
  '连接管·气管(mm)',
  '连接管·液管(mm)',
  '连接方式',
  '净重(kg)',
];

function parseSkuWorkbook(wb) {
  const infoRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const description = infoSheetToMarkdown(infoRows);

  const entries = [];
  let lastCat = '';
  for (const r of infoRows.slice(1)) {
    if (cell(r[0])) lastCat = cell(r[0]);
    if (cell(r[1]) || cell(r[2])) entries.push({ label: cell(r[1]), value: cell(r[2]) });
  }
  const findByLabel = (kw) => entries.find((e) => e.label.includes(kw) && e.value);

  const paramRows = XLSX.utils.sheet_to_json(wb.Sheets['工作表4'], { header: 1, defval: null });
  const paramTable = tableToMarkdown([PARAM_HEADERS, ...paramRows.slice(3)]);

  const knowledge = [
    '## 机型参数',
    paramTable,
    '## ' + wb.SheetNames[2],
    tableToMarkdown(forwardFillFirstCol(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[2]], { header: 1, defval: null }))),
    '## ' + wb.SheetNames[3],
    tableToMarkdown(forwardFillFirstCol(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[3]], { header: 1, defval: null }))),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    name: findByLabel('产品名称')?.value || '格力Star 5AI家庭中央空调',
    displayName: findByLabel('产品别称')?.value || null,
    description,
    knowledge,
    salesPolicy: findByLabel('价格')?.value || null,
    faq: findByLabel('常见疑问')?.value || findByLabel('FAQ')?.value || null,
    configType: 'product',
    brandId: 1,
  };
}

function parseAccountWorkbook(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const [uid, type, region, province, city, , store, url] = rows[i].map(cell);
    if (!uid) continue;
    const areaParts = [];
    if (region && region !== '无') areaParts.push(region);
    if (province && province !== '无') areaParts.push(province);
    if (city && city !== '无' && city !== province) areaParts.push(city);
    out.push({
      authorId: uid,
      nickname: store || `待补充-${uid.slice(-4)}`,
      platform: url.includes('douyin') ? 'douyin' : 'xhs',
      accountType: type || 'KOS',
      areaName: areaParts.join('·') || null,
      storeName: store || null,
      authorUrl: url || null,
      status: 'enabled',
      brandId: 1,
    });
  }
  return out;
}

async function main() {
  const skuWb = XLSX.readFile(SKU_FILE);
  const accountWb = XLSX.readFile(ACCOUNT_FILE);
  const product = parseSkuWorkbook(skuWb);
  const accounts = parseAccountWorkbook(accountWb);

  const dupUids = accounts.map((a) => a.authorId).filter((v, i, arr) => arr.indexOf(v) !== i);

  console.log('=== 解析结果 ===');
  console.log(`[Product] name=${product.name} displayName=${product.displayName}`);
  console.log(`  description ${product.description.length} 字 | knowledge ${product.knowledge.length} 字 | salesPolicy=${product.salesPolicy ? '有' : '无'} | faq=${product.faq ? '有' : '无'}`);
  console.log('  description 预览:', product.description.slice(0, 200).replace(/\n/g, ' ⏎ '));
  console.log(`[KosAccount] 共 ${accounts.length} 条`);
  console.log('  样例:', JSON.stringify(accounts.slice(0, 2), null, 0));
  if (dupUids.length) console.log(`  ⚠ 文件内重复 UID: ${[...new Set(dupUids)].join(', ')}`);

  if (DRY_RUN) {
    console.log('\n--dry-run：未写库，结束。');
    return;
  }

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  try {
    const existingProduct = await prisma.product.findFirst({ where: { name: product.name } });
    if (existingProduct) {
      await prisma.product.update({ where: { id: existingProduct.id }, data: product });
      updated++;
    } else {
      await prisma.product.create({ data: product });
      created++;
    }
    console.log(`\n[Product] ${existingProduct ? '更新' : '创建'}: ${product.name} (id=${existingProduct ? existingProduct.id : 'new'})`);

    let accCreated = 0;
    let accUpdated = 0;
    for (const a of accounts) {
      const exist = await prisma.kosAccount.findUnique({ where: { authorId: a.authorId } });
      await prisma.kosAccount.upsert({ where: { authorId: a.authorId }, update: a, create: a });
      exist ? accUpdated++ : accCreated++;
    }
    console.log(`[KosAccount] 新建 ${accCreated} 条 / 更新 ${accUpdated} 条`);

    const [pc, ac] = await Promise.all([prisma.product.count(), prisma.kosAccount.count()]);
    console.log(`\n=== 完成 === 当前库内 Product 总数=${pc}，KosAccount 总数=${ac}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
