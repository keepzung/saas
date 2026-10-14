#!/usr/bin/env node
// 来鼓会话存量数据回填（修复 MDD「私信三数恒为 0」的历史数据）：
//  1) sessionCreatedAt：来鼓 API 不返回会话创建时间，历史行该字段全为 NULL，
//     导致按时间窗筛选的 KPI/账号聚合永远查不到数据。
//     回填规则：rawJson.created_at（API 原始字段，若有）优先，缺失时回退 firstMessageAt。
//  2) isMdd：归属判定（有投放归因以投放账户白名单为准，特斯拉等其他品牌投放期的会话不并入；
//     无归因时按 小红书账号id / 客服昵称）对历史行重算，避免本品牌会话被过滤或他牌会话误入。
// 幂等可重跑；只更新有变化的行。
// 用法:
//   node backfill-laigu-session-times.cjs              # 执行
//   node backfill-laigu-session-times.cjs --dry-run    # 只统计不写库
//   node backfill-laigu-session-times.cjs --brandId 5  # 指定品牌（默认 5=MDD）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
// 加载 backend/.env（DATABASE_URL / LAIGU_MDD_ADVERTISERS）
const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const BRAND_ID = Number(argOf('--brandId', 5)) || 5;

/** MDD 投放账户白名单（与 backend/src/laigu/laigu.service.ts 保持一致） */
const MDD_ADVERTISERS = (process.env.LAIGU_MDD_ADVERTISERS ?? 'Morgan DaDa-种草')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const accs = await p.kosAccount.findMany({
    where: { brandId: BRAND_ID },
    select: { nickname: true, authorUrl: true },
  });
  const userIds = new Set();
  const nicknames = new Set();
  for (const a of accs) {
    if (a.nickname) nicknames.add(a.nickname);
    const m = (a.authorUrl ?? '').match(/\/profile\/([0-9a-f]+)$/);
    if (m) userIds.add(m[1]);
  }
  console.log(`品牌 ${BRAND_ID}：KOS 账号 ${accs.length} 个（userid ${userIds.size} / 昵称 ${nicknames.size}）；投放账户白名单: ${MDD_ADVERTISERS.join(', ')}`);

  const total = await p.laiguLead.count({ where: { brandId: BRAND_ID } });
  console.log(`待扫描会话 ${total} 条${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  let fixedTime = 0;
  let fixedMdd = 0;
  let fixedAdv = 0;
  let scanned = 0;
  let ops = [];
  const flush = async () => {
    if (DRY_RUN || !ops.length) { ops = []; return; }
    const batch = ops.splice(0, ops.length);
    await p.$transaction(batch, { timeout: 120000 });
  };

  const rows = await p.laiguLead.findMany({
    where: { brandId: BRAND_ID },
    select: {
      id: true, subSource: true, staffName: true, firstMessageAt: true,
      sessionCreatedAt: true, isMdd: true, advertiserName: true, rawJson: true,
    },
    orderBy: { id: 'asc' },
  });
  for (const r of rows) {
    scanned += 1;
    const raw = (r.rawJson ?? {});
    // 1) 会话创建时间：rawJson.created_at 优先，缺失回退首条消息时间
    let sc = r.sessionCreatedAt;
    if (sc == null) {
      const rawCreated = typeof raw.created_at === 'number' ? new Date(raw.created_at * 1000) : null;
      sc = rawCreated ?? r.firstMessageAt ?? null;
    }
    // 1.5) 投放账户名：rawJson.ad_info.advertiser_name 优先
    const rawAdv = (raw.ad_info ?? {}).advertiser_name ?? null;
    const adv = r.advertiserName ?? (rawAdv ? String(rawAdv).slice(0, 120) : null);
    // 2) MDD 归属重算（与 laigu.service.isMddSession 一致）：有投放归因时以投放账户白名单为准
    //    （特斯拉等其他品牌投放期的会话不并入 MDD）；无归因的自然流量按 账号id/客服昵称。
    //    Boolean() 兜底：避免 JS 短路产生 null 与布尔比较误判（null !== false 恒真）
    const advertiser = (raw.ad_info ?? {}).advertiser_name;
    const isMdd = BRAND_ID === 5
      ? Boolean(
        advertiser
          ? MDD_ADVERTISERS.includes(String(advertiser).trim())
          : (r.subSource && userIds.has(r.subSource)) || (r.staffName && nicknames.has(r.staffName)),
      )
      : r.isMdd;
    const timeDiff = (sc?.getTime() ?? null) !== (r.sessionCreatedAt?.getTime() ?? null);
    const advDiff = (adv ?? null) !== (r.advertiserName ?? null);
    if (timeDiff || isMdd !== r.isMdd || advDiff) {
      if (timeDiff) fixedTime += 1;
      if (isMdd !== r.isMdd) fixedMdd += 1;
      if (advDiff) fixedAdv += 1;
      ops.push(p.laiguLead.update({
        where: { id: r.id },
        data: {
          ...(timeDiff ? { sessionCreatedAt: sc } : {}),
          ...(isMdd !== r.isMdd ? { isMdd } : {}),
          ...(advDiff ? { advertiserName: adv } : {}),
        },
      }));
    }
    if (ops.length >= 200) {
      await flush();
      process.stdout.write(`  进度 ${scanned}/${total}（补时间 ${fixedTime}，改归属 ${fixedMdd}，补账户 ${fixedAdv}）\r`);
    }
  }
  await flush();
  console.log(`\n完成：扫描 ${scanned}，补 sessionCreatedAt ${fixedTime} 条，修正 isMdd ${fixedMdd} 条，补 advertiserName ${fixedAdv} 条${DRY_RUN ? '（dry-run 未写库）' : ''}`);
  await p.$disconnect();
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
