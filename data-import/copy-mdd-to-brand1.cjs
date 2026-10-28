#!/usr/bin/env node
// MDD Morgandada(brandId=5) 业务数据 → marketineok 演示工作区(brandId=1)（幂等，可重跑）
// 用途：马克听工作区向客户演示 MDD 功能，复制 brand 5 的真实数据到 brand 1。
// 安全边界：
//   - brand 5 全程只读；脚本首尾各做一次 brand 5 全表行数快照并比对，不一致即报错
//   - 所有写入只落在 brandId=1；全局唯一键(authorId/noteId/sessionId/virtualSellerId)加 b1m_ 前缀防冲突
//   - 不碰同步凭证表(SparkOrgConfig/ProOrgConfig/LaiguOrgConfig)，防止 cron 往 brand 1 重复同步
//   - 不碰 MddSalesOrder/MddChannelSale/MddCategory*(销售看板/种草转化后端写死读 brand 5，无需复制)
//   - 不碰 KoxRanfDaily(day 全局唯一，复制必冲突)、XhsHistory/内容包/创作任务(业务产出不跨工作区)
//   - 回滚：--clean 按 brandId=1 + b1m_ 前缀清除全部 mock 行
// 用法:
//   node copy-mdd-to-brand1.cjs --dry-run   # 只读试跑，打印将复制的行数，不写库
//   node copy-mdd-to-brand1.cjs             # 清旧 mock 行 + 全量复制(日常重跑入口，幂等)
//   node copy-mdd-to-brand1.cjs --clean     # 仅清除 brand 1 的 mock 行(回滚)
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const FROM = 5;
const TO = 1;
const PREFIX = 'b1m_';
const DRY_RUN = process.argv.includes('--dry-run');
const CLEAN_ONLY = process.argv.includes('--clean');
const BATCH = 500;

const prisma = new PrismaClient();

const dbLabel = () => {
  const url = process.env.DATABASE_URL || '';
  const m = url.match(/postgresql:\/\/[^@]*@([^/:]+):?\d*\/([^?]+)/);
  return m ? `${m[1]}/${m[2]}` : '(未识别)';
};

/** 去掉自增 id 与时间戳类字段，其余字段原样透传（Decimal/Json/BigInt/数组均可直过 createMany） */
function strip(row) {
  const { id, createdAt, updatedAt, fetchedAt, firstSeenAt, lastSeenAt, ...rest } = row;
  return rest;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function insertMany(model, rows, label) {
  if (!rows.length) { console.log(`  ${label}: 源 0 行，跳过`); return 0; }
  if (DRY_RUN) { console.log(`  ${label}: 将复制 ${rows.length} 行`); return rows.length; }
  let done = 0;
  for (const c of chunk(rows, BATCH)) {
    await prisma[model].createMany({ data: c });
    done += c.length;
  }
  console.log(`  ${label}: 已写入 ${done} 行`);
  return done;
}

// ── 需要复制的 brand 5 表清单（含源为 0 的，运行时自动跳过，将来 cron 补数后重跑即生效）
// 注意：koxAccountDailyStat 无 brandId 列，不在本清单，由 countAccountDailyStat 按账号归属单独统计 ──
const SNAPSHOT_TABLES = [
  'kosAccount', 'kosRosterEntry', 'koxNote', 'koxNoteDailyStat',
  'koxContentNoteDaily', 'koxContentStatDaily', 'koxJuguangNoteDaily', 'koxCampaignDailyStat',
  'sparkAccount', 'sparkStaffBrandDaily', 'sparkStaffUserDaily', 'proKosOverview', 'proKosStaff',
  'laiguLead', 'laiguComment', 'proClueDaily', 'proClueUserDay', 'proClueToolStatDaily',
  'clueAnalysisDaily', 'clueAcqToolDaily', 'koxDailyStat', 'koxRegionAdSnapshot',
  'koxDealerSnapshot', 'koxDealerSales', 'koxWeeklySnapshot', 'koxCampaignProject',
  'insightContent', 'insightDailyStat', 'insightReport',
];

/** koxAccountDailyStat 无 brandId 列，按账号归属统计 */
async function countAccountDailyStat(brandId) {
  const accounts = await prisma.kosAccount.findMany({ where: { brandId }, select: { id: true } });
  if (!accounts.length) return 0;
  return prisma.koxAccountDailyStat.count({ where: { accountId: { in: accounts.map((a) => a.id) } } });
}

async function snapshotFrom(label) {
  const snap = {};
  for (const t of SNAPSHOT_TABLES) snap[t] = await prisma[t].count({ where: { brandId: FROM } });
  snap.koxAccountDailyStat = await countAccountDailyStat(FROM);
  console.log(`\n[brand ${FROM} 快照] ${label}`);
  for (const [t, n] of Object.entries(snap)) if (n > 0) console.log(`  ${t}: ${n}`);
  return snap;
}

function diffSnapshot(before, after) {
  const diffs = [];
  for (const [t, n] of Object.entries(before)) {
    if (after[t] !== n) diffs.push(`${t}: ${n} → ${after[t]}`);
  }
  return diffs;
}

async function cleanMock() {
  console.log(`\n[清理] 清除 brand ${TO} 既有 mock 行${DRY_RUN ? '（dry-run 跳过）' : ''}`);
  const del = async (model, where, label) => {
    if (DRY_RUN) { console.log(`  ${label}: 将删除`); return; }
    const r = await prisma[model].deleteMany({ where });
    if (r.count) console.log(`  ${label}: 删除 ${r.count} 行`);
  };
  // 先删账号（其 KoxAccountDailyStat/KoxTaskAuthor 级联），再删其余
  const mockAccounts = await prisma.kosAccount.findMany({
    where: { brandId: TO, authorId: { startsWith: PREFIX } }, select: { id: true },
  });
  const ids = mockAccounts.map((a) => a.id);
  if (ids.length) {
    if (DRY_RUN) console.log(`  账号表现日Stat(级联): 将随 ${ids.length} 个 mock 账号删除`);
    else {
      const r = await prisma.koxAccountDailyStat.deleteMany({ where: { accountId: { in: ids } } });
      if (r.count) console.log(`  账号表现日Stat: 删除 ${r.count} 行`);
    }
  }
  await del('kosAccount', ids.length ? { id: { in: ids } } : { brandId: TO, authorId: { startsWith: PREFIX } }, 'KosAccount(mock)');
  await del('koxNote', { brandId: TO, noteId: { startsWith: PREFIX } }, 'KoxNote(mock)');
  await del('koxNoteDailyStat', { brandId: TO }, 'KoxNoteDailyStat');
  await del('koxContentNoteDaily', { brandId: TO }, 'KoxContentNoteDaily');
  await del('koxContentStatDaily', { brandId: TO }, 'KoxContentStatDaily');
  await del('koxJuguangNoteDaily', { brandId: TO }, 'KoxJuguangNoteDaily');
  await del('koxCampaignDailyStat', { brandId: TO }, 'KoxCampaignDailyStat');
  await del('sparkAccount', { brandId: TO, virtualSellerId: { startsWith: PREFIX } }, 'SparkAccount(mock)');
  await del('sparkStaffBrandDaily', { brandId: TO }, 'SparkStaffBrandDaily');
  await del('sparkStaffUserDaily', { brandId: TO }, 'SparkStaffUserDaily');
  await del('proKosOverview', { brandId: TO }, 'ProKosOverview');
  await del('proKosStaff', { brandId: TO }, 'ProKosStaff');
  await del('laiguLead', { brandId: TO, sessionId: { startsWith: PREFIX } }, 'LaiguLead(mock)');
  await del('laiguComment', { brandId: TO }, 'LaiguComment');
  await del('proClueDaily', { brandId: TO }, 'ProClueDaily');
  await del('proClueUserDay', { brandId: TO }, 'ProClueUserDay');
  await del('proClueToolStatDaily', { brandId: TO }, 'ProClueToolStatDaily');
  await del('clueAnalysisDaily', { brandId: TO }, 'ClueAnalysisDaily');
  await del('clueAcqToolDaily', { brandId: TO }, 'ClueAcqToolDaily');
  await del('koxDailyStat', { brandId: TO }, 'KoxDailyStat');
  await del('koxRegionAdSnapshot', { brandId: TO }, 'KoxRegionAdSnapshot');
  await del('koxDealerSnapshot', { brandId: TO }, 'KoxDealerSnapshot');
  await del('koxDealerSales', { brandId: TO }, 'KoxDealerSales');
  await del('koxWeeklySnapshot', { brandId: TO }, 'KoxWeeklySnapshot');
  await del('koxCampaignProject', { brandId: TO }, 'KoxCampaignProject(账号子表级联)');
  await del('insightContent', { brandId: TO }, 'InsightContent');
  await del('insightDailyStat', { brandId: TO }, 'InsightDailyStat');
  await del('insightReport', { brandId: TO }, 'InsightReport');
}

async function copyAll() {
  console.log(`\n[复制] brand ${FROM} → brand ${TO}${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  // ── 1. 账号（逐条 create 拿新 id，供笔记/日Stat外键映射；userId 置空避免撞 1:1 唯一约束）──
  const srcAccounts = await prisma.kosAccount.findMany({ where: { brandId: FROM } });
  const accMap = new Map(); // 旧 KosAccount.id → 新 id
  if (!DRY_RUN) {
    for (const a of srcAccounts) {
      const { id, ...data } = strip(a);
      const created = await prisma.kosAccount.create({
        data: { ...data, brandId: TO, authorId: PREFIX + a.authorId, userId: null },
        select: { id: true },
      });
      accMap.set(id, created.id);
    }
    console.log(`  KosAccount: 已写入 ${srcAccounts.length} 个（b1m_ 前缀，userId 置空）`);
  } else {
    console.log(`  KosAccount: 将复制 ${srcAccounts.length} 个`);
  }
  const remapAcc = (oldId) => (oldId != null ? accMap.get(oldId) ?? null : null);

  // ── 2. 账号表现日Stat（无 brandId 列，按新账号 id 挂靠）──
  if (srcAccounts.length) {
    const srcStats = await prisma.koxAccountDailyStat.findMany({
      where: { accountId: { in: srcAccounts.map((a) => a.id) } },
    });
    await insertMany('koxAccountDailyStat', srcStats.map((r) => {
      const { id, accountId, ...rest } = strip(r);
      return { ...rest, accountId: remapAcc(accountId) };
    }), 'KoxAccountDailyStat');
  }

  // ── 3. 笔记 ──
  const srcNotes = await prisma.koxNote.findMany({ where: { brandId: FROM } });
  await insertMany('koxNote', srcNotes.map((r) => {
    const { id, noteId, accountId, ...rest } = strip(r);
    return { ...rest, brandId: TO, noteId: PREFIX + noteId, accountId: remapAcc(accountId) };
  }), 'KoxNote');

  // ── 4. 笔记日Stat（量最大，分批）──
  const srcNoteStats = await prisma.koxNoteDailyStat.findMany({ where: { brandId: FROM } });
  await insertMany('koxNoteDailyStat', srcNoteStats.map((r) => {
    const { id, noteId, accountId, ...rest } = strip(r);
    return { ...rest, brandId: TO, noteId: PREFIX + noteId, accountId: remapAcc(accountId) };
  }), 'KoxNoteDailyStat');

  // ── 5. 聚光/投流 ──
  const srcContentNotes = await prisma.koxContentNoteDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxContentNoteDaily', srcContentNotes.map((r) => {
    const { id, noteId, ...rest } = strip(r);
    return { ...rest, brandId: TO, noteId: PREFIX + noteId };
  }), 'KoxContentNoteDaily');

  const srcContentStats = await prisma.koxContentStatDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxContentStatDaily', srcContentStats.map((r) => {
    const { id, vSellerId, ...rest } = strip(r);
    return { ...rest, brandId: TO, vSellerId: PREFIX + vSellerId };
  }), 'KoxContentStatDaily');

  const srcJuguang = await prisma.koxJuguangNoteDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxJuguangNoteDaily', srcJuguang.map((r) => {
    const { id, noteId, ...rest } = strip(r);
    return { ...rest, brandId: TO, noteId: PREFIX + noteId };
  }), 'KoxJuguangNoteDaily');

  const srcCampaign = await prisma.koxCampaignDailyStat.findMany({ where: { brandId: FROM } });
  await insertMany('koxCampaignDailyStat', srcCampaign.map((r) => {
    const { id, virtualSellerId, ...rest } = strip(r);
    return { ...rest, brandId: TO, virtualSellerId: PREFIX + virtualSellerId };
  }), 'KoxCampaignDailyStat');

  const srcSparkAccounts = await prisma.sparkAccount.findMany({ where: { brandId: FROM } });
  await insertMany('sparkAccount', srcSparkAccounts.map((r) => {
    const { id, virtualSellerId, ...rest } = strip(r);
    return { ...rest, brandId: TO, virtualSellerId: PREFIX + virtualSellerId };
  }), 'SparkAccount');

  // ── 6. 员工矩阵 / 专业号（复合唯一键含 brandId，直接换 brandId）──
  const copyBrandScoped = async (model, label) => {
    const rows = await prisma[model].findMany({ where: { brandId: FROM } });
    await insertMany(model, rows.map((r) => { const { id, ...rest } = strip(r); return { ...rest, brandId: TO }; }), label);
  };
  await copyBrandScoped('sparkStaffBrandDaily', 'SparkStaffBrandDaily');
  await copyBrandScoped('sparkStaffUserDaily', 'SparkStaffUserDaily');
  await copyBrandScoped('proKosOverview', 'ProKosOverview');
  await copyBrandScoped('proKosStaff', 'ProKosStaff');

  // ── 7. 线索 ──
  const srcLeads = await prisma.laiguLead.findMany({ where: { brandId: FROM } });
  await insertMany('laiguLead', srcLeads.map((r) => {
    const { id, sessionId, ...rest } = strip(r);
    return { ...rest, brandId: TO, sessionId: PREFIX + sessionId };
  }), 'LaiguLead');

  await copyBrandScoped('laiguComment', 'LaiguComment');
  await copyBrandScoped('proClueDaily', 'ProClueDaily');
  await copyBrandScoped('proClueUserDay', 'ProClueUserDay');
  await copyBrandScoped('proClueToolStatDaily', 'ProClueToolStatDaily');
  await copyBrandScoped('clueAnalysisDaily', 'ClueAnalysisDaily');
  await copyBrandScoped('clueAcqToolDaily', 'ClueAcqToolDaily');

  // ── 8. 总览/排行快照类 ──
  await copyBrandScoped('koxDailyStat', 'KoxDailyStat');
  await copyBrandScoped('koxRegionAdSnapshot', 'KoxRegionAdSnapshot');
  await copyBrandScoped('koxDealerSnapshot', 'KoxDealerSnapshot');
  await copyBrandScoped('koxDealerSales', 'KoxDealerSales');
  await copyBrandScoped('koxWeeklySnapshot', 'KoxWeeklySnapshot');

  // ── 9. 投流项目（createdById 指向真实用户，保留；子账号 vSellerId 同步加前缀）──
  const srcProjects = await prisma.koxCampaignProject.findMany({ where: { brandId: FROM } });
  if (DRY_RUN) {
    console.log(`  KoxCampaignProject: 将复制 ${srcProjects.length} 个项目（含账号子表）`);
  } else {
    for (const p of srcProjects) {
      const { id, ...rest } = strip(p);
      const child = await prisma.koxCampaignProjectAccount.findMany({ where: { projectId: id } });
      const created = await prisma.koxCampaignProject.create({
        data: { ...rest, brandId: TO }, select: { id: true },
      });
      if (child.length) {
        await prisma.koxCampaignProjectAccount.createMany({
          data: child.map((c) => ({
            projectId: created.id,
            virtualSellerId: c.virtualSellerId.startsWith(PREFIX) ? c.virtualSellerId : PREFIX + c.virtualSellerId,
          })),
        });
      }
    }
    console.log(`  KoxCampaignProject: 已写入 ${srcProjects.length} 个项目`);
  }

  // ── 10. 洞察 ──
  await copyBrandScoped('insightContent', 'InsightContent');
  await copyBrandScoped('insightDailyStat', 'InsightDailyStat');
  await copyBrandScoped('insightReport', 'InsightReport');
}

async function reportBrand1() {
  console.log(`\n[brand ${TO} 复制后行数]`);
  for (const t of SNAPSHOT_TABLES) {
    const n = await prisma[t].count({ where: { brandId: TO } });
    if (n > 0) console.log(`  ${t}: ${n}`);
  }
  const n = await countAccountDailyStat(TO);
  if (n > 0) console.log(`  koxAccountDailyStat: ${n}`);
}

async function main() {
  console.log(`MDD(${FROM}) → marketineok(${TO}) 演示数据复制`);
  console.log(`目标库: ${dbLabel()}${DRY_RUN ? ' [dry-run 只读]' : CLEAN_ONLY ? ' [仅清理]' : ' [将写入]'}`);
  if (!DRY_RUN && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 指向本地库——本脚本仅应在服务器上对 saas_prod 执行');
  }

  const before = await snapshotFrom('复制前');

  await cleanMock();
  if (!CLEAN_ONLY) await copyAll();

  if (!DRY_RUN) {
    const after = await snapshotFrom('复制后');
    const diffs = diffSnapshot(before, after);
    if (diffs.length) {
      console.error('\n⛔ brand 5 行数发生变化，可能被并发写入或脚本误写，请立即排查：');
      for (const d of diffs) console.error('  ' + d);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ brand ${FROM} 复制前后快照一致（只读承诺兑现）`);
    }
    await reportBrand1();
  }
  console.log(DRY_RUN ? '\ndry-run 完成，未写库' : CLEAN_ONLY ? '\n清理完成' : '\n复制完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
