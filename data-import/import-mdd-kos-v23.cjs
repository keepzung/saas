#!/usr/bin/env node
// Morgandada(5) 认证账号基线导入：DaDa kos 23个认证账号归属人.xlsx → KosAccount（严格以基线为准）
//  - 按 小红书主页链接 提取 userid upsert：昵称/主页(去token)/使用人→operatorName/注册手机号→operatorMobile/门店规范化
//  - 门店规范化：成都skp→成都SKP、南京德基店→南京德基、深圳罗湖万象城→深圳万象城
//  - 基线外的现有启用账号 → 禁用（--keep-all 可跳过禁用）
// 服务器执行: node data-import/import-mdd-kos-v23.cjs [--dry-run]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const XLSX_FILE = process.argv.slice(2).find((a) => a.endsWith('.xlsx'))
  || path.join(ROOT, 'morgandada', 'DaDa kos 23个认证账号归属人.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_ALL = process.argv.includes('--keep-all');

const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const XLSX = frontendRequire('xlsx');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();

/** 门店名规范化（与 mdd-sales.controller / 区域分组口径一致） */
function canonicalStore(s) {
  const t = String(s ?? '').trim();
  if (!t) return t;
  if (/^深圳罗湖万象城$/.test(t)) return '深圳万象城';
  if (/^南京德基(店)?$/.test(t)) return '南京德基';
  if (/^上海久光$/.test(t)) return '上海久光百货';
  if (/^成都skp$/i.test(t)) return '成都SKP';
  return t;
}

/** 从昵称推导门店：去 MorganDaDa 前缀 + 去个人后缀 */
function storeFromNickname(nick) {
  let s = String(nick ?? '').replace(/^morgan\s*dada[-_\s]?/i, '').trim();
  s = s.split(/[-－]/)[0].trim();
  return canonicalStore(s);
}

(async () => {
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
  const sheetName = wb.SheetNames.find((n) => /归属/.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  const baseline = [];
  const problems = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const nickname = String(r['认证—小红书昵称'] ?? r['小红书昵称'] ?? '').trim();
    const link = String(r['认证—小红书链接'] ?? r['小红书链接'] ?? '').trim();
    const uid = (link.match(/\/profile\/([0-9a-zA-Z]+)/) || [])[1] || null;
    if (!nickname || !uid) {
      problems.push(`第 ${i + 2} 行：昵称或主页链接缺失/无法解析（${nickname || '无昵称'}）`);
      continue;
    }
    baseline.push({
      uid,
      nickname,
      authorUrl: `https://www.xiaohongshu.com/user/profile/${uid}`,
      operatorName: r['使用人'] ? String(r['使用人']).trim() : null,
      operatorMobile: r['注册手机号'] != null && r['注册手机号'] !== '' ? String(r['注册手机号']).trim() : null,
      storeName: storeFromNickname(nickname),
      kosStatus: r['kos认证状态'] ? String(r['kos认证状态']).trim() : null,
      wecomName: r['企微名字'] ? String(r['企微名字']).trim() : null,
    });
  }
  const uids = new Set(baseline.map((b) => b.uid));
  console.log(`基线解析：${baseline.length} 个账号（问题行 ${problems.length}）`);
  for (const pr of problems) console.log('  [warn]', pr);

  // 现状（匹配键 = authorUrl 提取的小红书 userid；authorId 是 mdd_ 占位不作匹配键）
  const current = await p.kosAccount.findMany({
    where: { brandId: 5 },
    select: { id: true, authorId: true, nickname: true, storeName: true, status: true, operatorName: true, authorUrl: true },
  });
  const uidOf = (a) => (a.authorUrl || '').match(/\/profile\/([0-9a-zA-Z]+)/)?.[1] || null;
  const curByUid = new Map();
  const curByNick = new Map();
  for (const a of current) {
    const uid = uidOf(a);
    if (uid) curByUid.set(uid, a);
    if (a.nickname) curByNick.set(a.nickname, a);
  }
  // 基线 → 现有账号匹配（uid 优先，昵称兜底）
  const matchBase = (b) => curByUid.get(b.uid) ?? curByNick.get(b.nickname) ?? null;
  const toCreate = baseline.filter((b) => !matchBase(b));
  const toUpdate = baseline.map((b) => ({ base: b, cur: matchBase(b) })).filter((x) => x.cur);
  const baselineUids = new Set(baseline.map((b) => b.uid));
  const baselineNicks = new Set(baseline.map((b) => b.nickname));
  const toDisable = KEEP_ALL
    ? []
    : current.filter((a) => a.status === 'enabled' && !(baselineUids.has(uidOf(a)) || baselineNicks.has(a.nickname)));

  console.log('--- diff ---');
  console.log(`新增 ${toCreate.length}: ${toCreate.map((b) => b.nickname).join('、') || '-'}`);
  const renamed = toUpdate.filter((x) => x.cur.nickname !== x.base.nickname);
  console.log(`更新 ${toUpdate.length}（其中改名 ${renamed.length}: ${renamed.map((x) => `${x.cur.nickname}→${x.base.nickname}`).join('、') || '-'}）`);
  const storeChanged = toUpdate.filter((x) => x.cur.storeName !== x.base.storeName);
  console.log(`门店规范化 ${storeChanged.length}: ${storeChanged.map((x) => `${x.base.nickname}:${x.cur.storeName}→${x.base.storeName}`).join('、') || '-'}`);
  const opFilled = toUpdate.filter((x) => !x.cur.operatorName && x.base.operatorName);
  console.log(`补归属人 ${opFilled.length}: ${opFilled.map((x) => `${x.base.nickname}(${x.base.operatorName})`).join('、') || '-'}`);
  console.log(`禁用（基线外） ${toDisable.length}: ${toDisable.map((a) => a.nickname).join('、') || '-'}`);

  if (DRY_RUN) {
    console.log('（dry-run 未写库）');
    await p.$disconnect();
    return;
  }

  let upserted = 0;
  for (const b of baseline) {
    const cur = matchBase(b);
    const data = {
      nickname: b.nickname,
      authorUrl: b.authorUrl,
      operatorName: b.operatorName,
      operatorMobile: b.operatorMobile,
      storeName: b.storeName,
      accountType: 'KOS',
      platform: 'xhs',
      status: 'enabled',
    };
    if (cur) {
      // 保留原 authorId（笔记/归属引用一致），仅更新资料
      await p.kosAccount.update({ where: { id: cur.id }, data });
    } else {
      await p.kosAccount.create({ data: { ...data, brandId: 5, authorId: `mdd_${b.uid}` } });
    }
    upserted += 1;
  }
  let disabled = 0;
  for (const a of toDisable) {
    await p.kosAccount.update({ where: { id: a.id }, data: { status: 'disabled' } });
    disabled += 1;
  }
  const enabled = await p.kosAccount.count({ where: { brandId: 5, status: 'enabled' } });
  console.log(`完成：upsert ${upserted}，禁用 ${disabled}，当前启用账号 ${enabled}`);
  await p.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
