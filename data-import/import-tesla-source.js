#!/usr/bin/env node
// 特斯拉《投放数据源.xlsx》导入（brandId=6）
// 数据源：tesla/特斯拉投放数据源.xlsx（乐允导出，笔记×天粒度，2026-01-07 ~ 导出日）
// 用法:
//   node import-tesla-source.js --dry-run            （只统计不写库）
//   node import-tesla-source.js                      （导入：账号日聚合 + 笔记快照 + 账号信息）
//   node import-tesla-source.js --all-days           （连 09-25 之后也写入，默认跳过避免与 partner 日存档重复计数）
// 落点（全部为网站既有展示位置，不新增 UI）：
//   1) KoxCampaignDailyStat（accountKind='kos_author'）：投流总览 hero 卡/趋势图/账号表/区域汇总 的 2026 历史回填
//   2) KoxNote：曝光/阅读/进线/开口/留资 以 xlsx 累计为准（statDate 刷到导出末日）→ 笔记汇总页签/热门内容/笔记排行/总览内容指标
//   3) KosAccount：缺失账号补插；存量账号只填空字段（区域/门店/标签/认证人不覆盖已 curated 值）
// 说明：
//   - xlsx 每行是该笔记当天的增量值；KoxNote 库内快照为「自发布起累计、截至旧导出日」
//     → 已有笔记：新累计 = 库内值 + xlsx 中快照日之后的增量（不抹掉 2025 年历史）
//   - 新笔记无标题/发布时间，标题置占位、publishTime 用首个存档日近似（rawJson 标记）
//   - partner 日存档（09-25 起）不完整（09-27/28 缺失），xlsx 全期完整
//     → 覆盖范围内 partner 行删除、以 xlsx 行为准（重叠日期不重复计数）；范围外的 partner 行不动
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const XLSX = frontendRequire('xlsx');
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_PARTNER = process.argv.includes('--keep-partner');
const fileIdx = process.argv.indexOf('--file');
const FILE = fileIdx > -1 ? path.resolve(process.argv[fileIdx + 1]) : path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx');
const BRAND_ID = 6;
// partner 通道日存档自 2026-09-25 起；xlsx 覆盖该范围且更完整，默认替换（--keep-partner 则跳过重叠日期）
const PARTNER_START = '2026-09-25';
const ACCOUNT_KIND = 'kos_author';

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
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// xlsx 大区脏值归一（仅用于补插新账号；存量账号的区域以库内 curated 值为准）
const REGION_VALID = new Set([
  '上海', '苏皖', '北京', '山东', '浙江', '西北', '西一', '西二', '湖北', '湘赣',
  '华北', '广东', '福建', '东北', '华中', '西区', '南区', '全国', '托管',
]);
const normalizeRegion = (v) => {
  const s = cell(v).replace(/大区|区域/g, '').trim();
  if (!s || s === '全国' || s === '托管') return null;
  const base = REGION_VALID.has(s) ? s : s.replace(/区$/, '');
  return REGION_VALID.has(base) ? `${base}区` : cell(v) || null;
};

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
  const rows = readSheet('投放数据');
  if (!rows.length) {
    console.error('投放数据为空');
    process.exit(1);
  }

  // ── 解析：按 作者×天 聚合（KoxCampaignDailyStat），按 笔记 累计（KoxNote 快照）──
  const dayKey = (d) => {
    if (!(d instanceof Date)) return null;
    // excelDate 读出的 UTC 时间即东八区当日，取日期部分
    return d.toISOString().slice(0, 10);
  };
  const acctDay = new Map(); // `${authorId}|${day}` -> agg
  const acctAttrs = new Map(); // authorId -> {nickname, regions:Map, stores:Map, tags:Map, operators:Map}
  const noteAgg = new Map(); // noteId -> cumulative totals
  const noteDaily = new Map(); // noteId -> Map(day -> {imp,click,inq,open,leads})

  for (const r of rows) {
    const authorId = cell(r['作者ID']);
    const nickname = cell(r['昵称']) || cell(r['作者昵称']);
    const noteId = cell(r['笔记ID']);
    const day = dayKey(r['时间']);
    if (!authorId || !nickname || !noteId || !day) continue;

    const k = `${authorId}|${day}`;
    const cur =
      acctDay.get(k) ??
      {
        statDate: day,
        virtualSellerId: authorId,
        brandUserName: nickname,
        fee: 0,
        impression: 0,
        click: 0,
        interaction: 0,
        messageConsult: 0,
        msgChatUserCnt: 0,
        msgLeadsNum: 0,
      };
    cur.fee += num(r['消费']);
    cur.impression += num(r['展现量']);
    cur.click += num(r['点击量']);
    cur.interaction += num(r['互动量']);
    cur.messageConsult += num(r['私信进线数']);
    cur.msgChatUserCnt += num(r['私信开口数']);
    cur.msgLeadsNum += num(r['私信留资数']);
    acctDay.set(k, cur);

    if (!acctAttrs.has(authorId)) {
      acctAttrs.set(authorId, {
        nickname,
        regions: new Map(),
        stores: new Map(),
        tags: new Map(),
        operators: new Map(),
      });
    }
    const at = acctAttrs.get(authorId);
    const bump = (m, v) => {
      const s = cell(v);
      if (s) m.set(s, (m.get(s) ?? 0) + 1);
    };
    bump(at.regions, r['区域']);
    bump(at.stores, r['门店']);
    bump(at.tags, r['标签']);
    bump(at.operators, r['认证人']);

    const na =
      noteAgg.get(noteId) ??
      {
        noteId,
        authorId,
        nickname,
        firstDay: day,
        lastDay: day,
        fee: 0,
        impression: 0,
        click: 0,
        interaction: 0,
        inq: 0,
        open: 0,
        leads: 0,
        days: 0,
      };
    na.firstDay = day < na.firstDay ? day : na.firstDay;
    na.lastDay = day > na.lastDay ? day : na.lastDay;
    na.fee += num(r['消费']);
    na.impression += num(r['展现量']);
    na.click += num(r['点击量']);
    na.interaction += num(r['互动量']);
    na.inq += num(r['私信进线数']);
    na.open += num(r['私信开口数']);
    na.leads += num(r['私信留资数']);
    na.days += 1;
    noteAgg.set(noteId, na);

    if (!noteDaily.has(noteId)) noteDaily.set(noteId, new Map());
    const nd = noteDaily.get(noteId);
    const dv =
      nd.get(day) ?? { imp: 0, click: 0, inq: 0, open: 0, leads: 0 };
    dv.imp += num(r['展现量']);
    dv.click += num(r['点击量']);
    dv.inq += num(r['私信进线数']);
    dv.open += num(r['私信开口数']);
    dv.leads += num(r['私信留资数']);
    nd.set(day, dv);
  }

  const daysAll = [...acctDay.values()].map((v) => v.statDate).sort();
  const minDay = daysAll[0];
  const maxDay = daysAll[daysAll.length - 1];
  // 默认全期写入并替换重叠窗口的 partner 行；--keep-partner 则只写 partner 起点之前
  const writeDays = KEEP_PARTNER ? daysAll.filter((d) => d < PARTNER_START) : daysAll;
  const totalFee = [...acctDay.values()].reduce((s, v) => s + v.fee, 0);

  console.log(`日期范围: ${minDay} ~ ${maxDay}（写入 ${writeDays.length} 天${KEEP_PARTNER ? `，跳过 >= ${PARTNER_START} 的 ${daysAll.length - writeDays.length} 天` : '，覆盖重叠窗口 partner 行'}）`);
  console.log(`账号: ${acctAttrs.size} 个 | 笔记: ${noteAgg.size} 篇 | 消费合计: ¥${totalFee.toFixed(2)}`);

  const modeOf = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const accounts = [...acctAttrs.entries()].map(([authorId, at]) => ({
    authorId: `tesla_${md5(at.nickname).slice(0, 16)}`,
    xlsxAuthorId: authorId,
    nickname: at.nickname,
    regionName: normalizeRegion(modeOf(at.regions)),
    storeName: modeOf(at.stores),
    accountTag: modeOf(at.tags),
    operatorName: modeOf(at.operators),
  }));

  if (DRY_RUN) {
    console.log('--dry-run：未写库');
    console.log('样例账号:', JSON.stringify(accounts[0]));
    console.log('样例账号日聚合:', JSON.stringify(acctDay.get(`${[...acctAttrs.keys()][0]}|${minDay}`)));
    const sampleNote = [...noteAgg.values()][0];
    console.log('样例笔记累计:', JSON.stringify(sampleNote));
    console.log('写入账号日行数(估):', writeDays.length ? acctDay.size * (writeDays.length / daysAll.length) : 0);
    return;
  }

  const prisma = new PrismaClient();
  try {
    // 1) 账号：缺失补插；存量只填空字段（不覆盖 curated 区域/门店/标签）
    const dbAccounts = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, authorId: true, nickname: true, regionName: true, storeName: true, accountTag: true, operatorName: true },
    });
    const dbByAuthorId = new Map(dbAccounts.map((a) => [a.authorId, a]));
    const dbByNickname = new Map();
    for (const a of dbAccounts) if (!dbByNickname.has(a.nickname)) dbByNickname.set(a.nickname, a);

    let accCreated = 0;
    let accFilled = 0;
    for (const a of accounts) {
      const exist = dbByAuthorId.get(a.authorId) ?? dbByNickname.get(a.nickname);
      if (!exist) {
        await prisma.kosAccount.create({
          data: {
            authorId: a.authorId,
            nickname: a.nickname,
            platform: 'xhs',
            accountType: 'KOS',
            fans: 0,
            regionName: a.regionName,
            storeName: a.storeName,
            accountTag: a.accountTag,
            operatorName: a.operatorName,
            status: 'enabled',
            brandId: BRAND_ID,
          },
        });
        accCreated += 1;
      } else {
        const patch = {};
        if (!exist.regionName && a.regionName) patch.regionName = a.regionName;
        if (!exist.storeName && a.storeName) patch.storeName = a.storeName;
        if (!exist.accountTag && a.accountTag) patch.accountTag = a.accountTag;
        if (!exist.operatorName && a.operatorName) patch.operatorName = a.operatorName;
        if (Object.keys(patch).length) {
          await prisma.kosAccount.update({ where: { id: exist.id }, data: patch });
          accFilled += 1;
        }
        if (!dbByAuthorId.has(a.authorId)) dbByAuthorId.set(a.authorId, exist);
      }
    }
    console.log(`账号入库: 新建 ${accCreated} / 补空字段 ${accFilled}`);

    // accountId 映射（含刚新建的）
    const dbAccounts2 = await prisma.kosAccount.findMany({
      where: { brandId: BRAND_ID },
      select: { id: true, nickname: true },
    });
    const acctIdByNickname = new Map();
    for (const a of dbAccounts2) if (!acctIdByNickname.has(a.nickname)) acctIdByNickname.set(a.nickname, a.id);

    // 2) KoxCampaignDailyStat：清本脚本写入域 + 重叠窗口 partner 行，再批量插入（幂等、以 xlsx 为准）
    const rangeFilter = {
      statDate: { gte: new Date(`${minDay}T00:00:00.000+08:00`), lte: new Date(`${maxDay}T23:59:59.999+08:00`) },
    };
    const del = await prisma.koxCampaignDailyStat.deleteMany({
      where: { brandId: BRAND_ID, accountKind: ACCOUNT_KIND, ...rangeFilter },
    });
    let delPartner = 0;
    if (!KEEP_PARTNER) {
      const dp = await prisma.koxCampaignDailyStat.deleteMany({
        where: { brandId: BRAND_ID, accountKind: 'partner_vseller', ...rangeFilter },
      });
      delPartner = dp.count;
    }
    console.log(`清理旧 kos_author 行: ${del.count}${KEEP_PARTNER ? '' : ` / 重叠窗口 partner 行: ${delPartner}（以 xlsx 为准）`}`);

    const statRows = [];
    for (const v of acctDay.values()) {
      if (!writeDays.includes(v.statDate)) continue;
      statRows.push({
        statDate: new Date(`${v.statDate}T00:00:00.000+08:00`),
        virtualSellerId: v.virtualSellerId,
        brandUserName: v.brandUserName,
        accountKind: ACCOUNT_KIND,
        fee: Math.round(v.fee * 100) / 100,
        impression: v.impression,
        click: v.click,
        interaction: v.interaction,
        messageConsult: v.messageConsult,
        msgChatUserCnt: v.msgChatUserCnt,
        msgLeadsNum: v.msgLeadsNum,
        brandId: BRAND_ID,
        rawJson: { source: 'tesla_source_xlsx' },
      });
    }
    for (let i = 0; i < statRows.length; i += 1000) {
      await prisma.koxCampaignDailyStat.createMany({ data: statRows.slice(i, i + 1000) });
    }
    console.log(`账号日聚合入库: ${statRows.length} 行（${minDay} ~ ${writeDays[writeDays.length - 1] ?? '-'}）`);

    // 3) KoxNote：库内快照为「自发布起累计、截至 statDate」
    //    已有笔记：新累计 = 库内值 + xlsx 中 statDate 之后的增量（不抹掉 2025 历史）
    //    新笔记：直接用 xlsx 全期累计；赞/藏/评/享/涨粉 xlsx 无分列，保持不动
    const STAT_DATE = new Date(`${maxDay}T00:00:00.000+08:00`);
    let noteUpdated = 0;
    let noteCreated = 0;
    const noteIds = [...noteAgg.keys()];
    const existingNotes = await prisma.koxNote.findMany({
      where: { brandId: BRAND_ID, noteId: { in: noteIds } },
      select: { id: true, noteId: true, exposure: true, views: true, pmInquiries: true, pmOpenings: true, pmLeads: true, rawJson: true, statDate: true },
    });
    const existByNoteId = new Map(existingNotes.map((n) => [n.noteId, n]));

    const incAfter = (noteId, cutoffDay) => {
      const nd = noteDaily.get(noteId);
      const out = { imp: 0, click: 0, inq: 0, open: 0, leads: 0 };
      if (!nd) return out;
      for (const [d, v] of nd) {
        if (d > cutoffDay) {
          out.imp += v.imp;
          out.click += v.click;
          out.inq += v.inq;
          out.open += v.open;
          out.leads += v.leads;
        }
      }
      return out;
    };
    // 日期转东八区日键（statDate 以 +08:00 存库，toISOString 会回退一天）
    const dayKeyOf = (d) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);

    for (const n of noteAgg.values()) {
      const exist = existByNoteId.get(n.noteId);
      const accountId = acctIdByNickname.get(n.nickname) ?? null;
      const srcAgg = {
        fee: Math.round(n.fee * 100) / 100,
        impression: n.impression,
        click: n.click,
        interaction: n.interaction,
        msg_inquiries: n.inq,
        msg_openings: n.open,
        msg_leads: n.leads,
        days: n.days,
        from: n.firstDay,
        to: n.lastDay,
      };
      if (exist) {
        const cutoff = exist.statDate ? dayKeyOf(exist.statDate) : n.firstDay;
        const inc = incAfter(n.noteId, cutoff);
        const raw = {
          ...(exist.rawJson ?? {}),
          tesla_source_agg: srcAgg,
          tesla_source_inc_since: { from: cutoff, ...inc },
        };
        await prisma.koxNote.update({
          where: { noteId: n.noteId },
          data: {
            exposure: exist.exposure + inc.imp,
            views: exist.views + inc.click,
            pmInquiries: exist.pmInquiries + inc.inq,
            pmOpenings: exist.pmOpenings + inc.open,
            pmLeads: exist.pmLeads + inc.leads,
            isRtbAdver: n.fee > 0 ? true : undefined,
            ...(accountId != null ? { accountId } : {}),
            rawJson: raw,
            statDate: STAT_DATE,
          },
        });
        noteUpdated += 1;
      } else {
        await prisma.koxNote.create({
          data: {
            noteId: n.noteId,
            brandId: BRAND_ID,
            title: '(乐允投放笔记)',
            noteType: 'normal',
            accountId,
            authorName: n.nickname,
            accountType: 'KOS',
            publishTime: new Date(`${n.firstDay}T00:00:00.000+08:00`),
            exposure: n.impression,
            views: n.click,
            pmInquiries: n.inq,
            pmOpenings: n.open,
            pmLeads: n.leads,
            isRtbAdver: n.fee > 0 ? true : null,
            rawJson: { tesla_source_agg: srcAgg, publish_time_approx: true },
            statDate: STAT_DATE,
          },
        });
        noteCreated += 1;
      }
    }
    console.log(`笔记入库: 更新 ${noteUpdated} / 新建 ${noteCreated}`);

    const [accTotal, noteTotal, statTotal] = await Promise.all([
      prisma.kosAccount.count({ where: { brandId: BRAND_ID } }),
      prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
      prisma.koxCampaignDailyStat.count({ where: { brandId: BRAND_ID, accountKind: ACCOUNT_KIND } }),
    ]);
    console.log(`\n=== 完成 === brand ${BRAND_ID} 当前：账号 ${accTotal} / 笔记 ${noteTotal} / kos_author 日聚合 ${statTotal} 行`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
