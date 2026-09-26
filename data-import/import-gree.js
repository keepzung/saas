#!/usr/bin/env node
// 格力（brandId=8）旧系统导出数据导入
// 来源：gree/*.csv（旧系统 saas.marketine.cn 导出，结构同东风）
// 口径：
//   - 账号 29（监控列表×账号排行合并；投放计划命中的昵称用真实 UID，其余 gr_<md5(昵称)>）
//   - 笔记 48 重导入（幂等）+ 投放明细 20 条真实 noteId 置 isRtbAdver=true
//   - 投放快照 20 行 → KoxCampaignDailyStat（statDate=2026-09-24 单日快照，accountKind=gr_snapshot）
//   - 经销商 27 行 → KoxDealerSnapshot（statMonth=2026-09）；区域投放 1 行 → KoxRegionAdSnapshot
// 用法: node import-gree.js [--dir gree] [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const dirIdx = process.argv.indexOf('--dir');
const DIR = dirIdx > -1 ? path.resolve(process.argv[dirIdx + 1]) : path.resolve(__dirname, '../gree');
const BRAND = 8;
const SNAP_DATE = '2026-09-24';

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
const dec = (v) => {
  const s = cell(v).replace(/[,，\s￥¥%]/g, '');
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const excelDate = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(String(v).replace('T', ' ').replace(/-/g, '/'));
  return Number.isNaN(d.getTime()) ? null : d;
};
const md5 = (s) => require('crypto').createHash('md5').update(s).digest('hex');

function readCsv(name) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) {
    console.log(`（缺少 ${name}，跳过）`);
    return [];
  }
  const buf = fs.readFileSync(p);
  let text = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.slice(3).toString('utf8') : buf.toString('utf8');
  if (text.includes('\ufffd')) text = buf.toString('latin1');
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return rows;
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? null; });
    rows.push(row);
  }
  console.log(`${name}: ${rows.length} 行`);
  return rows;
}

async function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`目录不存在: ${DIR}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    // ---------- 1) 账号（监控列表 × 账号排行 合并） ----------
    const monitorRows = readCsv('账号监控列表_20260924171041.csv');
    const rankRows = readCsv('账号排行_20260924171002.csv');
    const rankByNick = new Map(rankRows.map((r) => [cell(r['账号']), r]));
    const planAccRows = readCsv('投放计划_20260924_171025.csv');
    const uidByNick = new Map(
      planAccRows.filter((r) => cell(r['账号UID'])).map((r) => [cell(r['账号']), cell(r['账号UID'])]),
    );
    const accounts = new Map();
    for (const r of monitorRows) {
      const nickname = cell(r['账号']);
      if (!nickname) continue;
      const rank = rankByNick.get(nickname) ?? {};
      accounts.set(nickname, {
        authorId: uidByNick.get(nickname) ?? `gr_${md5(nickname).slice(0, 16)}`,
        nickname,
        platform: 'xhs',
        accountType: cell(rank['账号类型']) || 'KOS',
        fans: num(rank['粉丝数']),
        noteQuality: num(rank['笔记质量']),
        regionName: cell(r['区域']) || null,
        areaName: [cell(r['省份']), cell(r['城市'])].filter(Boolean).join('·') || null,
        storeName: cell(r['所属经销商门店']) || null,
        storeCode: cell(r['门店编码']) || null,
        operatorName: cell(r['账号运营人']) || null,
        authorUrl: null,
        status: 'enabled',
        brandId: BRAND,
      });
    }
    for (const [nick, rank] of rankByNick) {
      if (accounts.has(nick)) continue;
      accounts.set(nick, {
        authorId: uidByNick.get(nick) ?? `gr_${md5(nick).slice(0, 16)}`,
        nickname: nick,
        platform: 'xhs',
        accountType: cell(rank['账号类型']) || 'KOS',
        fans: num(rank['粉丝数']),
        noteQuality: num(rank['笔记质量']),
        regionName: cell(rank['大区']) || null,
        areaName: [cell(rank['省份']), cell(rank['城市'])].filter(Boolean).join('·') || null,
        storeName: cell(rank['所属经销商']) || null,
        storeCode: cell(rank['编码']) || null,
        operatorName: null,
        authorUrl: null,
        status: 'enabled',
        brandId: BRAND,
      });
    }
    console.log(`账号解析: ${accounts.size} 个`);

    // ---------- 2) 投放计划（账号维度 → 快照；笔记维度 → 真实 noteId + 明细） ----------
    const planNoteRows = readCsv('投放计划_20260924_171029.csv');
    const statDate = new Date(`${SNAP_DATE}T00:00:00.000Z`);
    const campaignRows = planAccRows
      .map((r) => {
        const uid = cell(r['账号UID']);
        const name = cell(r['账号']);
        if (!uid || !name) return null;
        return {
          statDate,
          virtualSellerId: uid,
          accountKind: 'gr_snapshot',
          brandUserName: name,
          fee: num(r['消耗']),
          impression: num(r['展现量']),
          click: num(r['点击量']),
          interaction: num(r['互动量']),
          messageConsult: num(r['私信进线数']),
          msgChatUserCnt: num(r['私信开口数']),
          msgLeadsNum: num(r['私信留资数']),
          brandId: BRAND,
          rawJson: {
            gr_snapshot: true,
            source: 'old_system_export_20260924',
            cpl: dec(r['CPL']), cpm: dec(r['CPM']), cpc: dec(r['CPC']), ctr: dec(r['CTR']), cpe: dec(r['CPE']),
            reply_rate: dec(r['一分钟回复率']), inquiry_cost: dec(r['进线成本']), open_cost: dec(r['开口成本']),
            open_lead_rate: dec(r['开口留资率']), note_cnt: num(r['投流笔记数']),
            region: cell(r['大区']), province: cell(r['省份']), city: cell(r['城市']),
            store_code: cell(r['门店编码']), store_name: cell(r['门店名称']),
          },
        };
      })
      .filter(Boolean);
    console.log(`投放快照(账号维度): ${campaignRows.length} 行，合计 ¥${campaignRows.reduce((s, r) => s + r.fee, 0).toFixed(2)}`);

    // ---------- 3) 笔记 48（重导入幂等）+ 投放明细 20（真实 noteId，isRtbAdver） ----------
    const noteRows = readCsv('笔记排行_20260924171013.csv');
    const notes = noteRows
      .map((r) => {
        const title = cell(r['标题']);
        const nickname = cell(r['发布者']);
        if (!title && !nickname) return null;
        return {
          noteId: `gr_${md5(`${title}|${nickname}|${cell(r['发布时间'])}`).slice(0, 24)}`,
          title: title || '(无标题)',
          noteType: 'normal',
          publishTime: excelDate(r['发布时间']),
          exposure: num(r['内容曝光数']),
          views: num(r['内容阅读数']),
          likes: num(r['内容点赞数']),
          collects: num(r['内容收藏数']),
          comments: num(r['内容评论数']),
          shares: num(r['内容分享数']),
          followCount: num(r['获得关注数']),
          pmInquiries: num(r['私信进线数']),
          pmOpenings: num(r['私信开口数']),
          pmLeads: num(r['私信留资数']),
          authorName: nickname || null,
          accountType: cell(r['账号类型']) || 'KOS',
          brandId: BRAND,
        };
      })
      .filter(Boolean);
    const promotedNotes = planNoteRows
      .map((r) => {
        const noteId = cell(r['笔记ID']);
        const title = cell(r['笔记标题']);
        if (!noteId && !title) return null;
        return {
          noteId: noteId || `gr_${md5(`${title}|${cell(r['账号'])}`).slice(0, 24)}`,
          title: title || '(无标题)',
          noteType: 'normal',
          publishTime: null,
          exposure: num(r['展现量']),
          views: 0,
          likes: 0,
          collects: 0,
          comments: 0,
          shares: 0,
          followCount: 0,
          pmInquiries: num(r['私信进线数']),
          pmOpenings: num(r['私信开口数']),
          pmLeads: num(r['私信留资数']),
          authorName: cell(r['账号']) || null,
          accountType: 'KOS',
          brandId: BRAND,
          isRtbAdver: true,
          statDate,
          rawJson: {
            gr_snapshot: true,
            fee: num(r['消耗']), cpm: dec(r['千展成本']), click: num(r['点击量']), cpc: dec(r['CPC']), ctr: dec(r['CTR']),
            interaction: num(r['互动量']), cpe: dec(r['CPE']), inquiry_cost: dec(r['进线成本']),
            open_cost: dec(r['开口成本']), lead_cost: dec(r['留资成本']), open_lead_rate: dec(r['开口留资率']),
          },
        };
      })
      .filter(Boolean);
    const promoByTitle = new Map(promotedNotes.filter((p) => p.title).map((p) => [p.title, p]));
    for (const n of notes) {
      const p = promoByTitle.get(n.title);
      if (p) {
        n.isRtbAdver = true;
        if (!p.promotedApplied) {
          p.promotedApplied = true;
          p.publishTime = n.publishTime;
          p.views = n.views;
          p.likes = n.likes;
          p.collects = n.collects;
          p.comments = n.comments;
          p.shares = n.shares;
          p.followCount = n.followCount;
        }
      }
    }
    console.log(`笔记解析: 排行 ${notes.length} 条（命中投放 ${notes.filter((n) => n.isRtbAdver).length}）+ 投放明细 ${promotedNotes.length} 条`);

    // ---------- 4) 经销商快照 27 + 区域投放快照 ----------
    const dealerRows = readCsv('代理商运营_202609.csv');
    const dealers = dealerRows
      .map((r) => ({
        brandId: BRAND,
        dealerName: cell(r['代理商']),
        regionName: cell(r['大区']) || null,
        cityName: cell(r['城市']) || null,
        tier: cell(r['分层']) || null,
        score: dec(r['综合得分']),
        accountCnt: num(r['账号数']),
        publishCnt: num(r['发布数']),
        contentPct: dec(r['内容完成度%']),
        exposure: num(r['曝光量']),
        exposurePct: dec(r['曝光完成度%']),
        inquiries: num(r['进线数']),
        openings: num(r['开口数']),
        leads: num(r['留资数']),
        leadsPct: dec(r['留资完成度%']),
        deals: num(r['成交数']),
        dealsPct: dec(r['成交完成度%']),
        statMonth: '2026-09',
        rawJson: { source: 'old_system_export_202609' },
      }))
      .filter((d) => d.dealerName);
    console.log(`经销商快照: ${dealers.length} 行`);

    const regionAdRows = readCsv('区域投放情况_20260924_170944.csv');
    const regionAds = regionAdRows
      .map((r) => ({
        brandId: BRAND,
        regionName: cell(r['区域']) || '全国',
        fee: num(r['投流消耗']),
        accountCnt: num(r['投流账号数量']),
        noteCnt: num(r['投流笔记数']),
        replyRate: dec(r['一分钟回复率']),
        inquiries: num(r['私信进线数']),
        openings: num(r['私信开口数']),
        leads: num(r['私信留资数']),
        openRate: dec(r['开口率']),
        openLeadRate: dec(r['开口留资率']),
        inquiryCost: dec(r['进线成本']),
        openCost: dec(r['开口成本']),
        leadCost: dec(r['留资成本']),
        statDate,
        rawJson: { source: 'old_system_export_20260924' },
      }))
      .filter((r) => r.regionName);
    console.log(`区域投放快照: ${regionAds.length} 行`);

    if (DRY_RUN) {
      console.log('--dry-run：未写库。样例:', JSON.stringify([...accounts.values()][0]));
      return;
    }

    // ---------- 入库 ----------
    // 清理历史 md5 方案不一致产生的重复（保留真实 noteId 的投放明细）
    await prisma.koxNote.deleteMany({
      where: { brandId: BRAND, noteId: { startsWith: 'gr_' }, isRtbAdver: null },
    });

    let accNew = 0;
    for (const a of accounts.values()) {
      const exist = await prisma.kosAccount.findUnique({ where: { authorId: a.authorId } });
      const { brandId, ...data } = a;
      if (exist) await prisma.kosAccount.update({ where: { authorId: a.authorId }, data });
      else { await prisma.kosAccount.create({ data: a }); accNew += 1; }
    }
    console.log(`账号入库: 新建 ${accNew} / 更新 ${accounts.size - accNew}`);

    const acctRows = await prisma.kosAccount.findMany({ where: { brandId: BRAND }, select: { id: true, nickname: true } });
    const acctIdByName = new Map(acctRows.map((a) => [a.nickname, a.id]));

    let noteDone = 0;
    const upsertNote = async (n) => {
      const noteId = n.noteId ?? `gr_${md5(`${n.title}|${n.authorName}|${n.publishTime ? n.publishTime.toISOString() : ''}`).slice(0, 24)}`;
      const accountId = n.authorName ? (acctIdByName.get(n.authorName) ?? null) : null;
      const { authorName, accountType, brandId, ...data } = n;
      data.authorName = authorName;
      data.accountType = accountType;
      data.brandId = brandId;
      const rel = accountId != null ? { account: { connect: { id: accountId } } } : {};
      await prisma.koxNote.upsert({
        where: { noteId },
        update: { ...data, ...rel },
        create: { noteId, ...data, ...rel },
      });
      noteDone += 1;
    };
    for (const n of notes) await upsertNote(n);
    for (const n of promotedNotes) await upsertNote(n);
    console.log(`笔记入库: ${noteDone} 条`);

    for (const c of campaignRows) {
      await prisma.koxCampaignDailyStat.upsert({
        where: { statDate_virtualSellerId: { statDate: c.statDate, virtualSellerId: c.virtualSellerId } },
        update: { ...c, statDate: undefined, virtualSellerId: undefined },
        create: c,
      });
    }
    console.log(`投放快照入库: ${campaignRows.length} 行`);

    await prisma.koxDealerSnapshot.deleteMany({ where: { brandId: BRAND, statMonth: '2026-09' } });
    await prisma.koxDealerSnapshot.createMany({ data: dealers });
    console.log(`经销商快照入库: ${dealers.length} 行`);

    await prisma.koxRegionAdSnapshot.deleteMany({ where: { brandId: BRAND } });
    await prisma.koxRegionAdSnapshot.createMany({ data: regionAds });
    console.log(`区域投放快照入库: ${regionAds.length} 行`);

    const [acc, note, cs, dealerSnapshot] = await Promise.all([
      prisma.kosAccount.count({ where: { brandId: BRAND } }),
      prisma.koxNote.count({ where: { brandId: BRAND } }),
      prisma.koxCampaignDailyStat.count({ where: { brandId: BRAND } }),
      prisma.koxDealerSnapshot.count({ where: { brandId: BRAND } }),
    ]);
    console.log(`\n=== 完成 === 格力8: 账号 ${acc} / 笔记 ${note} / 投放快照 ${cs} / 经销商快照 ${dealerSnapshot}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
