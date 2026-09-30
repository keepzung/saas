#!/usr/bin/env node
// 特斯拉《投放数据源.xlsx》周度快照导入（brandId=6）→ KoxWeeklySnapshot
// 数据源：tesla/特斯拉投放数据源.xlsx
//   -《专业号留资数据》sheet：账号×周 留资（进线/开口/私信留资/服务卡/预约/个微复制/企微/落地页/交易卡 + 总留资）
//   -《投放数据》sheet：笔记×天 → 聚合 账号×周 曝光/点击/互动/消费
// 说明：
//   - 周结构沿用 xlsx 原始「当周开始/当周结束」（与既有客户两周快照互不冲突，unique 键不同）
//   - publishNotes/promotedNotes xlsx 无发布数置 0；tierLabel 留空
//   - 幂等：按周 deleteMany+createMany；重跑安全
// 用法:
//   node import-tesla-weekly-source.js --dry-run
//   node import-tesla-weekly-source.js [--file <xlsx路径>]
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
const FILE = fileIdx > -1 ? path.resolve(process.argv[fileIdx + 1]) : path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx');
const BRAND_ID = 6;

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cell = (v) => (v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim());
const num = (v) => {
  const s = cell(v).replace(/[,，\s]/g, '');
  if (!s || s === '-' || s === '--') return 0;
  if (/万/.test(s)) return Math.round(parseFloat(s) * 10000) || 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const dayKey = (d) => (d instanceof Date ? new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10) : null);

function readSheet(sn) {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets[sn];
  if (!ws) throw new Error(`sheet 不存在: ${sn}`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`[${sn}] ${rows.length} 行`);
  return rows;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`文件不存在: ${FILE}`);
    process.exit(1);
  }
  const leadRows = readSheet('专业号留资数据');
  const planRows = readSheet('投放数据');

  // 留资：uid×周 聚合（留资 sheet 一行=账号×周，聚合防重）
  const leads = new Map(); // `${uid}|${weekStart}` -> agg
  const nickByUid = new Map();
  for (const r of leadRows) {
    const uid = cell(r['belongUserId']);
    const week = dayKey(r['当周开始']);
    const weekEnd = dayKey(r['当周结束']);
    const nick = cell(r['账号昵称']);
    if (!uid || !week) continue;
    if (nick && !nickByUid.has(uid)) nickByUid.set(uid, nick);
    const k = `${uid}|${week}`;
    const cur =
      leads.get(k) ??
      {
        weekStart: week,
        weekEnd,
        inquiries: 0,
        openings: 0,
        pmLeads: 0,
        serviceCard: 0,
        appointment: 0,
        wecomCopy: 0,
        totalLeads: 0,
        otherLeads: 0,
      };
    cur.inquiries += num(r['私信进线人数']);
    cur.openings += num(r['私信开口人数']);
    cur.pmLeads += num(r['私信留资人数']);
    cur.serviceCard += num(r['服务卡留资人数']);
    cur.appointment += num(r['预约组件留资人数']);
    cur.wecomCopy += num(r['个微复制留资人数']);
    const landing = num(r['落地页留资人数']);
    const trade = num(r['交易卡留资人数']);
    cur.otherLeads += landing + trade + num(r['企微名片留资人数']);
    cur.totalLeads += num(r['总留资']) || num(r['私信留资人数']) + num(r['服务卡留资人数']) + num(r['预约组件留资人数']) + num(r['个微复制留资人数']) + landing + trade;
    leads.set(k, cur);
  }

  // 投放：uid×周 聚合 曝光/点击/互动/消费
  const plan = new Map(); // `${uid}|${week}` -> agg
  for (const r of planRows) {
    const uid = cell(r['作者ID']);
    const week = dayKey(r['当周开始']);
    if (!uid || !week) continue;
    const k = `${uid}|${week}`;
    const cur = plan.get(k) ?? { exposure: 0, clicks: 0, interaction: 0, spend: 0 };
    cur.exposure += num(r['展现量']);
    cur.clicks += num(r['点击量']);
    cur.interaction += num(r['互动量']);
    cur.spend += num(r['消费']);
    plan.set(k, cur);
  }

  const uids = new Set([...leads.keys(), ...plan.keys()].map((k) => k.split('|')[0]));
  const weeks = [...new Set([...leads.values(), ...plan.values()].map((v) => v.weekStart).filter(Boolean))].sort();
  const totalLeadsSum = [...leads.values()].reduce((s, v) => s + v.totalLeads, 0);
  console.log(`周数: ${weeks.length}（${weeks[0]} ~ ${weeks[weeks.length - 1]}）| 账号: ${uids.size} | 账号周行: ${leads.size + plan.size} | 总留资: ${totalLeadsSum}`);

  if (DRY_RUN) {
    const sampleK = [...leads.keys()][0];
    console.log('--dry-run：未写库');
    console.log('样例留资周行:', JSON.stringify(leads.get(sampleK)));
    return;
  }

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, nickname: true, regionName: true, storeName: true },
    });
    const accByNick = new Map(accounts.map((a) => [a.nickname, a]));

    // 按周分组写库（幂等：先清同周再插）
    const rowsByWeek = new Map();
    const push = (week, row) => {
      if (!rowsByWeek.has(week)) rowsByWeek.set(week, []);
      rowsByWeek.get(week).push(row);
    };
    for (const uid of uids) {
      const nick = nickByUid.get(uid);
      const acc = nick ? accByNick.get(nick) : null;
      const weeksOfUid = new Set([
        ...[...leads.keys()].filter((k) => k.startsWith(uid + '|')).map((k) => k.split('|')[1]),
        ...[...plan.keys()].filter((k) => k.startsWith(uid + '|')).map((k) => k.split('|')[1]),
      ]);
      for (const week of weeksOfUid) {
        const l = leads.get(`${uid}|${week}`);
        const p = plan.get(`${uid}|${week}`) ?? { exposure: 0, clicks: 0, interaction: 0, spend: 0 };
        if (!l && !p.exposure && !p.clicks) continue;
        push(week, {
          brandId: BRAND_ID,
          weekStart: new Date(`${week}T00:00:00.000+08:00`),
          weekEnd: new Date(`${l?.weekEnd ?? week}T23:59:59.999+08:00`),
          accountId: acc?.id ?? null,
          uid,
          accountName: nick ?? uid,
          accountType: 'KOS',
          regionName: acc?.regionName ?? null,
          storeName: acc?.storeName ?? null,
          publishNotes: 0,
          promotedNotes: 0,
          spend: Math.round(p.spend * 100) / 100,
          exposure: p.exposure,
          clicks: p.clicks,
          interaction: p.interaction,
          inquiries: l?.inquiries ?? 0,
          openings: l?.openings ?? 0,
          pmLeads: l?.pmLeads ?? 0,
          serviceCardLeads: l?.serviceCard ?? 0,
          appointmentLeads: l?.appointment ?? 0,
          wecomCopyLeads: l?.wecomCopy ?? 0,
          totalLeads: l?.totalLeads ?? 0,
        });
      }
    }

    let inserted = 0;
    for (const [week, rows] of rowsByWeek) {
      await prisma.koxWeeklySnapshot.deleteMany({ where: { brandId: BRAND_ID, weekStart: new Date(`${week}T00:00:00.000+08:00`) } });
      for (let i = 0; i < rows.length; i += 500) {
        await prisma.koxWeeklySnapshot.createMany({ data: rows.slice(i, i + 500) });
      }
      inserted += rows.length;
      console.log(`周 ${week}: ${rows.length} 行`);
    }
    console.log(`\n=== 完成 === 写入 ${weeks.length} 周 / ${inserted} 行（周结构：xlsx 当周开始~结束）`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
