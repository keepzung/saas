#!/usr/bin/env node
// 特斯拉旧看板数据导入（brandId=6）
// 来源：tesla/特斯拉历史数据保存20250101-20260924.zip 解压后的 7 个 Excel
// 用法:
//   node import-tesla.js --dir <解压目录>            （导入账号/笔记/项目）
//   node import-tesla.js --dir <解压目录> --dry-run  （只统计不写库）
// 说明：
//   - 账号无 UID，authorId = tesla_<md5(昵称)前16> 稳定生成；后续星火同步按昵称关联
//   - 笔记 33,117 条为周期累计快照（与星火笔记同语义），noteId 取自笔记链接
//   - 项目 17 期写入 KoxCampaignProject，累计指标存 importedStats（无日粒度，不造假分摊）
//   - 区域/账号标签排行为聚合表，运行时由账号+笔记实时聚合，不导入
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const dirIdx = process.argv.indexOf('--dir');
const DIR = dirIdx > -1 ? path.resolve(process.argv[dirIdx + 1]) : path.resolve(__dirname, '../tesla-data');
const BRAND_ID = 6;
const EXPORT_DATE = '2026-09-24';

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
  if (/万$/.test(s)) return Math.round(parseFloat(s) * 10000) || 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const excelDate = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(Math.round((v - 25569) * 86400000));
  }
  const d = new Date(String(v).replace(/-/g, '/'));
  return Number.isNaN(d.getTime()) ? null : d;
};

function readSheet(name) {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) {
    console.log(`（缺少 ${name}，跳过）`);
    return [];
  }
  const wb = XLSX.readFile(file, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  console.log(`${name}: ${rows.length} 行`);
  return rows;
}

const noteIdFromUrl = (url) => {
  const m = String(url ?? '').match(/(?:explore|discovery\/item)\/([0-9a-f]{16,32})/i);
  return m ? m[1] : null;
};

async function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`目录不存在: ${DIR}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    // 1) 账号
    const accountRows = readSheet('tesla_author_rank_data_list.xlsx');
    const accounts = [];
    for (const r of accountRows) {
      const nickname = cell(r['昵称']);
      if (!nickname) continue;
      const md5 = require('crypto').createHash('md5').update(nickname).digest('hex');
      accounts.push({
        authorId: `tesla_${md5.slice(0, 16)}`,
        nickname,
        platform: 'xhs',
        accountType: 'KOS',
        accountTag: cell(r['账号标签']) || null,
        fans: num(r['粉丝']),
        regionName: cell(r['所属区域']) || null,
        storeName: cell(r['所属门店']) || null,
        authorUrl: null,
        status: 'enabled',
        brandId: BRAND_ID,
      });
    }
    console.log(`账号解析: ${accounts.length} 条，区域 ${new Set(accounts.map((a) => a.regionName)).size} 个，标签 ${new Set(accounts.map((a) => a.accountTag)).size} 个`);

    // 2) 笔记
    const noteRows = readSheet('tesla_note_rank_data_list.xlsx');
    const planRows = readSheet('tesla_clue_plan_item_list.xlsx');
    const promotedIds = new Set(planRows.map((r) => cell(r['笔记id'])).filter(Boolean));
    const statDate = new Date(`${EXPORT_DATE}T00:00:00.000Z`);
    const acctIdByNickname = new Map();
    for (const a of accounts) {
      if (!acctIdByNickname.has(a.nickname)) acctIdByNickname.set(a.nickname, null);
    }
    const acctRows = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID, authorId: { startsWith: 'tesla_' } },
      select: { id: true, authorId: true, nickname: true },
    });
    for (const a of acctRows) acctIdByNickname.set(a.nickname, a.id);

    const notes = [];
    let noId = 0;
    for (const r of noteRows) {
      const title = cell(r['标题']);
      const url = cell(r['笔记链接']);
      const nickname = cell(r['昵称']);
      if (!title && !nickname) continue;
      let noteId = noteIdFromUrl(url);
      if (!noteId) {
        noteId = `tesla_old_${require('crypto').createHash('md5').update(`${title}|${nickname}|${cell(r['发布时间'])}`).digest('hex').slice(0, 24)}`;
        noId += 1;
      }
      const planItem = null;
      notes.push({
        noteId,
        accountId: acctIdByNickname.get(nickname) ?? null,
        brandId: BRAND_ID,
        title: title || '(无标题)',
        content: cell(r['内容']) || null,
        noteUrl: url || null,
        noteType: 'normal',
        publishTime: excelDate(r['发布时间']),
        exposure: num(r['曝光']),
        views: num(r['阅读']),
        likes: num(r['点赞']),
        collects: num(r['收藏']),
        comments: num(r['评论']),
        shares: num(r['分享']),
        followCount: num(r['获得粉丝']),
        pmInquiries: num(r['进线']),
        pmOpenings: num(r['开口']),
        pmLeads: num(r['留资']),
        authorName: nickname || null,
        accountType: cell(r['账号类型']) || 'KOS',
        isRtbAdver: promotedIds.has(noteId) ? true : null,
        statDate,
      });
    }
    console.log(`笔记解析: ${notes.length} 条（无链接 ${noId} 条用 md5 兜底），被投流 ${notes.filter((n) => n.isRtbAdver).length} 条`);

    // 3) 项目
    const projectRows = readSheet('tesla_clue_project_list.xlsx');
    const projects = projectRows
      .map((r) => {
        const start = excelDate(r['项目开始时间']);
        const end = excelDate(r['项目结束时间']);
        if (!start || !end) return null;
        return {
          name: cell(r['项目名']) || '(未命名项目)',
          startDate: start,
          endDate: end,
          budget: num(r['项目预算']) || null,
          remark: '导入自旧系统（uplus 乐允）',
          brandId: BRAND_ID,
          createdById: admin?.id ?? 1,
          importedStats: {
            source: 'uplus_import_20250101_20260924',
            fee: num(r['实际消耗']),
            impression: num(r['曝光']),
            click: num(r['点击']),
            interaction: num(r['互动']),
            cpm: num(r['千展成本']),
            avg_interaction_cost: num(r['平均互动成本']),
            msg_inquiries: num(r['进线']),
            msg_openings: num(r['开口']),
            msg_leads: num(r['留资']),
          },
        };
      })
      .filter(Boolean);
    console.log(`项目解析: ${projects.length} 期`);

    if (DRY_RUN) {
      console.log('--dry-run：未写库。样例账号:', JSON.stringify(accounts[0]));
      console.log('样例笔记:', JSON.stringify(notes[0]));
      return;
    }

    let accCreated = 0;
    for (const a of accounts) {
      const { brandId, ...data } = a;
      const exist = await prisma.kosAccount.findUnique({ where: { authorId: a.authorId } });
      await prisma.kosAccount.upsert({ where: { authorId: a.authorId }, update: data, create: a });
      if (!exist) accCreated += 1;
    }
    console.log(`账号入库: 新建 ${accCreated} / 更新 ${accounts.length - accCreated}`);

    // 投流明细折叠进笔记 rawJson（供后续分析）
    const planByNote = new Map();
    for (const r of planRows) {
      const id = cell(r['笔记id']);
      if (id) planByNote.set(id, r);
    }

    let noteDone = 0;
    for (const n of notes) {
      const plan = planByNote.get(n.noteId);
      const { accountId, ...data } = n;
      const rel = accountId != null ? { account: { connect: { id: accountId } } } : {};
      if (plan) {
        data.rawJson = {
          tesla_plan_item: {
            fee: num(plan['消耗']),
            impression: num(plan['展现量']),
            click: num(plan['点击量']),
            interaction: num(plan['互动']),
            msg_inquiries: num(plan['私信进线']),
            msg_openings: num(plan['私信开口']),
            msg_leads: num(plan['私信留资']),
          },
        };
      }
      await prisma.koxNote.upsert({
        where: { noteId: n.noteId },
        update: { ...data, ...rel, rawJson: data.rawJson ?? undefined },
        create: { ...data, ...rel, rawJson: data.rawJson ?? undefined },
      });
      noteDone += 1;
      if (noteDone % 5000 === 0) console.log(`  笔记进度 ${noteDone}/${notes.length}`);
    }
    console.log(`笔记入库: ${noteDone} 条`);

    let projDone = 0;
    for (const p of projects) {
      const exist = await prisma.koxCampaignProject.findFirst({
        where: { brandId: BRAND_ID, name: p.name, startDate: p.startDate },
      });
      if (exist) {
        await prisma.koxCampaignProject.update({ where: { id: exist.id }, data: p });
      } else {
        await prisma.koxCampaignProject.create({ data: p });
      }
      projDone += 1;
    }
    console.log(`项目入库: ${projDone} 期`);

    const [accTotal, noteTotal, projTotal] = await Promise.all([
      prisma.kosAccount.count({ where: { brandId: BRAND_ID } }),
      prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
      prisma.koxCampaignProject.count({ where: { brandId: BRAND_ID } }),
    ]);
    console.log(`\n=== 完成 === brand ${BRAND_ID} 当前：账号 ${accTotal} / 笔记 ${noteTotal} / 项目 ${projTotal}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
