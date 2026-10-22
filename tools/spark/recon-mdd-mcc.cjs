/* MDD 与 MCC 平台对账工具：内容数（笔记分析·员工笔记逐篇 diff）+ 线索数（线索分析·账号维度/按天 diff）
 * 用法: NODE_PATH=/opt/saas/backend/node_modules node recon-mdd-mcc.cjs [start] [end]
 *   start/end 缺省=近20天~今天；依赖 SparkOrgConfig(brandId=5) cookie 有效，失效时报 code=902 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ARG_START = process.argv[2] || new Date(Date.now() - 19 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const ARG_END = process.argv[3] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const rowMap = (r) => {
  const m = new Map();
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  for (const t of list) {
    const v = t.targetValue ?? t.targetOriginValue ?? t.targetDownloadValue;
    if (v != null && v !== '') m.set(String(t.targetCode), v);
  }
  return m;
};
const H = async () => {
  const org = await p.sparkOrgConfig.findFirst({ where: { brandId: 5, active: true } });
  return { 'Content-Type': 'application/json', Cookie: org.cookie, 'User-Agent': UA, Origin: BASE, Referer: `${BASE}/micro/note-data`, 'Accept-Language': 'zh-CN,zh;q=0.9' };
};
const callVision = async (h, body, referer) => {
  const res = await fetch(`${BASE}/api/vision/mcc_dashboard/target_detail_list`, { method: 'POST', headers: { ...h, Referer: `${BASE}${referer}` }, body: JSON.stringify(body) });
  const j = await res.json();
  if (j.code !== 0 && j.success !== true) throw new Error(`API code=${j.code} msg=${j.msg}`);
  const vo = j.data?.detailListVo ?? {};
  return { total: vo.total ?? 0, rows: vo.detailVoList ?? vo.detailDataList ?? [] };
};
const timeDimFilter = (dim) => ({ filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ selected: dim === 'all_key' ? 1 : 0, labelValue: 'all_key', labelName: '合计' }, { selected: dim === 'date_key' ? 1 : 0, labelValue: 'date_key', labelName: '按天' }] }, filterField: 'time_dim', filterFieldName: '时间维度' });

(async () => {
  const h = await H();
  const WIN = [ARG_START, ARG_END];

  // ── 1) 内容数对账 ──
  const noteBody = (pageNo) => ({
    viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
    chart: 'noteList',
    dynamicTargets: ['note_id', 'note_title', 'note_publish_time', 'author_name', 'imp_num'],
    sorts: [],
    page: { pageNo, pageSize: 500 },
    frontFilterList: [
      { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ selected: 1, labelValue: 'all_key', labelName: '合计' }] } },
      { filterField: 'date_key', filterFieldName: '笔记数据范围', filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, disableRange: 0, limitMax: 366, quickDates: [6], values: WIN } },
      { filterField: 'note_publish_date', filterFieldName: '笔记发布日期', filterType: 10, timeFilter: { pattern: 10, timeShowType: 11, disableRange: 1, limitMax: 366, quickDates: [6], values: WIN } },
      { filterField: 'is_rtb_adver', filterFieldName: '推广状态', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] } },
      { filterField: 'content_type', filterFieldName: '笔记来源', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '员工笔记', labelName: '员工笔记' }] } },
      { filterField: 'note_type', filterFieldName: '笔记类型', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] } },
    ],
  });
  let plat = await callVision(h, noteBody(1), '/micro/note-data');
  let rows = plat.rows;
  for (let pg = 2; rows.length < plat.total && pg <= 10; pg++) {
    const nxt = await callVision(h, noteBody(pg), '/micro/note-data');
    rows = rows.concat(nxt.rows);
  }
  console.log(`[内容] 平台 total=${plat.total} rows=${rows.length}`);
  const platByAuthor = new Map();
  const platNotes = new Map();
  for (const r of rows) {
    const m = rowMap(r);
    const nid = String(m.get('note_id') ?? '');
    const author = String(m.get('author_name') ?? '(空)');
    platByAuthor.set(author, (platByAuthor.get(author) ?? 0) + 1);
    if (nid) platNotes.set(nid, { author, pub: String(m.get('note_publish_time') ?? '') });
  }
  const W = { gte: new Date(`${ARG_START}T00:00:00+08:00`), lte: new Date(`${ARG_END}T23:59:59+08:00`) };
  const dbNotes = await p.koxNote.findMany({ where: { brandId: 5, publishTime: W }, select: { noteId: true, authorName: true, accountId: true } });
  const accs = await p.kosAccount.findMany({ where: { brandId: 5 }, select: { id: true, nickname: true, status: true } });
  const accById = new Map(accs.map((a) => [a.id, a]));
  const enabledNicks = new Set(accs.filter((a) => a.status === 'enabled').map((a) => a.nickname));
  const dbIds = new Set(dbNotes.map((n) => n.noteId));
  const missing = [...platNotes.entries()].filter(([nid]) => !dbIds.has(nid));
  console.log(`[内容] 库内窗口=${dbNotes.length}（启用基线可归因=${dbNotes.filter((n) => (n.accountId != null && accById.get(n.accountId)?.status === 'enabled') || enabledNicks.has(n.authorName)).length}）`);
  console.log(`[内容] 平台有/库内无 = ${missing.length}:`);
  for (const [nid, info] of missing) console.log(`  - ${nid} | ${info.author} | ${info.pub}`);

  // ── 2) 线索对账 ──
  const clueBody = (pageNo, dim) => ({
    viewAlias: 'mcc_assets_clueManage_clueAnalysisListView',
    dynamicTargets: ['pro_user_id', 'pro_user_name', 'sub_user_id', 'sub_user_name', 'new_clue_cnt', 'new_ads_clue_cnt', 'new_nature_clue_cnt', 'leads_user_cnt'],
    sorts: [],
    page: { pageNo, pageSize: 200 },
    frontFilterList: [
      { filterField: 'date_key', filterFieldName: '线索生成时间', filterType: 10, timeFilter: { disableRange: 0, limitMax: 366, quickDates: [6], values: WIN, pattern: 10, timeShowType: 11 } },
      timeDimFilter(dim),
    ],
  });
  const fetchClue = async (dim) => {
    let first = await callVision(h, clueBody(1, dim), '/micro/clues-data');
    let all = first.rows;
    for (let pg = 2; all.length < first.total && pg <= 40; pg++) {
      const nxt = await callVision(h, clueBody(pg, dim), '/micro/clues-data');
      all = all.concat(nxt.rows);
    }
    return { total: first.total, rows: all };
  };
  const allKey = await fetchClue('all_key');
  let platClueSum = 0;
  const platClueRows = [];
  for (const r of allKey.rows) {
    const m = rowMap(r);
    const cnt = Number(String(m.get('new_clue_cnt') ?? '0').replace(/,/g, '')) || 0;
    platClueSum += cnt;
    platClueRows.push({ sub: String(m.get('sub_user_id') ?? '(空)'), name: String(m.get('sub_user_name') ?? '(空)'), pro: String(m.get('pro_user_name') ?? ''), cnt, ads: Number(String(m.get('new_ads_clue_cnt') ?? '0').replace(/,/g, '')) || 0, nature: Number(String(m.get('new_nature_clue_cnt') ?? '0').replace(/,/g, '')) || 0 });
  }
  console.log(`[线索] 平台行数=${allKey.total} 账号维度加总=${platClueSum}`);
  const dbClue = await p.clueAnalysisDaily.aggregate({ where: { brandId: 5, day: W }, _sum: { clueCnt: true, adsClueCnt: true, natureClueCnt: true } });
  console.log(`[线索] 库内窗口合计=${dbClue._sum.clueCnt} (广告${dbClue._sum.adsClueCnt}/自然${dbClue._sum.natureClueCnt})`);
  console.log('[线索] 平台行明细(>0):');
  for (const r of platClueRows.filter((x) => x.cnt > 0).sort((a, b) => b.cnt - a.cnt)) console.log(`  - ${r.name} (sub=${r.sub}, pro=${r.pro}): 线索=${r.cnt} 广告=${r.ads} 自然=${r.nature}`);
  // 库内 per-day 与平台 date_key 对比找差异日
  const dateKey = await fetchClue('date_key');
  const platByDay = new Map();
  for (const r of dateKey.rows) {
    const m = rowMap(r);
    const day = String(m.get('date_key') ?? '').slice(0, 10);
    platByDay.set(day, (platByDay.get(day) ?? 0) + (Number(String(m.get('new_clue_cnt') ?? '0').replace(/,/g, '')) || 0));
  }
  const dbByDay = await p.clueAnalysisDaily.groupBy({ by: ['day'], where: { brandId: 5, day: W }, _sum: { clueCnt: true } });
  for (const d of dbByDay) {
    const key = d.day.toISOString().slice(0, 10);
    const pv = platByDay.get(key) ?? 0;
    if (pv !== d._sum.clueCnt) console.log(`[线索] 日差异 ${key}: 库=${d._sum.clueCnt} 平台=${pv}`);
  }
  for (const [day, v] of platByDay) {
    const dbRow = dbByDay.find((d) => d.day.toISOString().slice(0, 10) === day);
    if (!dbRow && v > 0) console.log(`[线索] 库缺日 ${day}: 平台=${v}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
