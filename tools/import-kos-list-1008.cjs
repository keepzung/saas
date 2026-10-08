#!/usr/bin/env node
// 以《1008特斯拉KOS账号list.xlsx》为基线重建 KOS 账号清单（brandId=6）
// - 按 账号uid(=authorId) upsert：昵称/大区/门店/标签(=账号类型)/认证人(=运营者)/链接
// - 全部置 enabled、accountType=KOS；库内 enabled 但不在 xlsx 的账号不会被删除（本次核对为 0）
// 用法: node import-kos-list-1008.cjs            （dry-run 只看差异）
//       node import-kos-list-1008.cjs --apply    （写库）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
let req;
try { req = createRequire(path.join(HERE, 'noop.js')); } catch { req = createRequire(HERE + '/'); }
const { PrismaClient } = req(path.join(ROOT, 'backend', 'node_modules', '@prisma', 'client'));
const XLSX = req(path.join(ROOT, 'frontend', 'node_modules', 'xlsx'));

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const APPLY = process.argv.includes('--apply');
const BRAND_ID = 6;

(async () => {
  const docs = path.join(ROOT, 'docs');
  const xlsxFile = fs.readdirSync(docs).find((f) => f.startsWith('1008') && f.endsWith('.xlsx'));
  if (!xlsxFile) { console.error('未找到 docs/1008*.xlsx'); process.exit(1); }
  const wb = XLSX.readFile(path.join(docs, xlsxFile));
  const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const rows = arr.slice(1).filter((r) => r && (r[4] || r[5])).map((r) => ({
    type: String(r[0] ?? '').trim(),
    region: String(r[1] ?? '').trim(),
    operator: String(r[2] ?? '').trim(),
    store: String(r[3] ?? '').trim(),
    name: String(r[4] ?? '').trim(),
    uid: String(r[5] ?? '').trim(),
    link: String(r[6] ?? '').trim(),
  })).filter((r) => r.uid);
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.uid)) { console.error('xlsx 内重复 uid，跳过:', r.name, r.uid); continue; }
    seen.add(r.uid);
  }
  const list = rows.filter((r) => seen.has(r.uid));
  console.log(`xlsx 账号 ${list.length} 个（apply=${APPLY}）`);

  const p = new PrismaClient();
  let created = 0, updated = 0;
  for (const r of list) {
    const data = {
      nickname: r.name,
      regionName: r.region || null,
      storeName: r.store || null,
      accountTag: r.type || null,
      operatorName: r.operator || null,
      authorUrl: r.link || null,
      accountType: 'KOS',
      status: 'enabled',
    };
    const prev = await p.kosAccount.findUnique({ where: { authorId: r.uid }, select: { id: true, nickname: true, status: true, regionName: true, storeName: true, accountTag: true } });
    if (!prev) {
      created += 1;
      console.log(`+ 新建 ${r.name} | ${r.region} | ${r.store} | ${r.type} | uid=${r.uid}`);
      if (APPLY) await p.kosAccount.create({ data: { authorId: r.uid, brandId: BRAND_ID, platform: 'xhs', ...data } });
    } else {
      const diff = [];
      if (prev.nickname !== r.name) diff.push(`昵称:${prev.nickname}->${r.name}`);
      if ((prev.regionName || '') !== r.region) diff.push(`大区:${prev.regionName}->${r.region}`);
      if ((prev.storeName || '') !== r.store) diff.push(`门店:${prev.storeName}->${r.store}`);
      if ((prev.accountTag || '') !== r.type) diff.push(`标签:${prev.accountTag}->${r.type}`);
      if (prev.status !== 'enabled') diff.push(`状态:${prev.status}->enabled`);
      if (diff.length) {
        updated += 1;
        console.log(`~ 更新 ${r.name}（id=${prev.id}）${diff.join('；')}`);
        if (APPLY) await p.kosAccount.update({ where: { id: prev.id }, data });
      }
    }
  }
  const enabled = await p.kosAccount.count({ where: { brandId: BRAND_ID, status: 'enabled' } });
  console.log(`\n结果：新建 ${created} / 更新 ${updated}；当前 enabled 账号 ${enabled} 个${APPLY ? '' : '（dry-run，未写库；加 --apply 执行）'}`);
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
