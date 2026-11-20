#!/usr/bin/env node
// 格力 KoxNote 元数据回补: 监控账号(30)的笔记在 KoxNote 元数据表缺 8-01~9-16 段
// (元数据同步 11-10 才开始), 从 MCC 笔记分析视图 all_key 合计维度一次拉全量,
// 过滤监控账号(authorId UID 优先/昵称兜底), 连最新累计指标一并 upsert KoxNote。
// 注意: >33 天窗口会致 ziran_* 自然列置零, 故本脚本不写自然字段, 保留原值。
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/noop.js');
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
const BRAND = 8;
const MCC = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIME_START = process.argv[2] || '2026-08-01';
const TIME_END = process.argv[3] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v ?? '').replace(/,/g,'').trim(); if (!s || s==='-'||s==='--') return 0;
  if (/万$/.test(s)) return Math.round(parseFloat(s)*10000)||0; const n = Number(s); return Number.isFinite(n)?Math.round(n):0; };
const str = (v) => String(v ?? '').trim();
const rowMap = (r) => { const m = new Map();
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  for (const t of list ?? []) { const v = t.targetValue ?? t.targetOriginValue ?? t.targetDownloadValue;
    if (v != null && v !== '') m.set(String(t.targetCode), v); }
  for (const [k, v] of Object.entries(r)) { if (k !== 'targetList' && k !== 'targetVos' && v != null && v !== '') m.set(k, v); }
  return m; };
async function fetchPage(pageNo) {
  // 每次尝试重读最新 cookie: keepalive/其他消费方可能轮换 acw_tc, 旧值会 401/403
  const orgFresh = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
  const cookie = orgFresh.cookie;
  const body = { viewAlias: 'mcc_assets_creativityContent_noteAnalysisView', chart: 'noteList',
    dynamicTargets: ['note_id','note_title','note_publish_time','author_name','brand_user_name','note_status','note_type','is_rtb_adver','staff_city','staff_label','huati_tag_list','imp_num','read_feed_num','like_num','cmt_num','fav_num','share_num','follow_num','engage_num','message_open_cnt','message_driving_open_cnt','msg_leads_num','leads_success'],
    sorts: [], page: { pageNo, pageSize: 500 },
    frontFilterList: [
      { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ selected: 1, labelValue: 'all_key', labelName: '合计' }] } },
      { filterField: 'date_key', filterFieldName: '笔记数据范围', filterType: 10, timeFilter: { pattern: 30, timeShowType: 11, disableRange: 0, limitMax: 366, quickDates: [6,16,21,36,41,46,51], values: [TIME_START, TIME_END] } },
      { filterField: 'is_rtb_adver', filterFieldName: '推广状态', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] } },
      { filterField: 'content_type', filterFieldName: '笔记来源', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] } },
      { filterField: 'note_type', filterFieldName: '笔记类型', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] } },
    ] };
  for (let a = 1; a <= 3; a++) {
    let res;
    try { res = await fetch(MCC + '/api/vision/mcc_dashboard/target_detail_list', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'User-Agent': UA, Origin: MCC, Referer: MCC + '/micro/note-data', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      body: JSON.stringify(body) }); }
    catch (e) { if (a === 3) throw new Error('网络错误×3: ' + e.message); await sleep(3000*a); continue; }
    if (res.status === 401 || res.status === 403) {
      if (a >= 3) throw new Error('cookie 失效或风控拦截(401/403 ×3)');
      console.log('[warn] 401/403 第' + a + '次, 退避重试...');
      await sleep(8000 * a);
      continue;
    }
    const json = await res.json().catch(() => null);
    if (!json || (json.code !== 0 && json.success !== true)) throw new Error('API 错误 code=' + (json && json.code) + ' msg=' + (json && (json.msg || json.message)));
    const vo = (json.data && json.data.detailListVo) || {};
    return { total: vo.total ?? 0, rows: vo.detailDataList ?? vo.detailVoList ?? [] };
  }
}
async function main() {
  const org0 = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
  if (!org0 || !org0.cookie) throw new Error('brand8 无 cookie');
  const accounts = await prisma.kosAccount.findMany({ where: { brandId: BRAND }, select: { id: true, nickname: true, authorId: true } });
  const byUid = new Map(accounts.filter(a => /^[0-9a-f]{24}$/.test(a.authorId)).map(a => [a.authorId, a]));
  const byNick = new Map(accounts.filter(a => a.nickname).map(a => [a.nickname, a]));
  console.log('监控账号=', accounts.length, ' 窗口=', TIME_START, '~', TIME_END);
  const t0 = Date.now();
  const seen = new Map(); // noteId -> row(最新一次)
  let total = 0;
  for (let pageNo = 1; pageNo <= 200; pageNo++) {
    const { total: apiTotal, rows } = await fetchPage(pageNo);
    if (pageNo === 1) { total = apiTotal; console.log('视图 total=', total); }
    if (!rows.length) break;
    for (const r of rows) {
      const m = rowMap(r);
      const noteId = str(m.get('note_id'));
      if (noteId) seen.set(noteId, m);
    }
    if (seen.size >= total || rows.length < 500) break;
  }
  console.log('视图去重笔记=', seen.size, ' 耗时(拉取)=', Math.round((Date.now()-t0)/1000) + 's');
  let upserted = 0, matched = 0, noPub = 0;
  let pubSampleLogged = false;
  for (const [noteId, m] of seen) {
    const authorUid = str(m.get('author_id')) || null;
    const authorName = str(m.get('author_name')) || null;
    const acct = (authorUid && byUid.get(authorUid)) || (authorName && byNick.get(authorName)) || null;
    if (!acct) continue;
    matched += 1;
    const pubRaw = str(m.get('note_publish_time'));
    let pub = null;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(pubRaw)) pub = new Date(pubRaw.replace(' ', 'T') + '+08:00');
    else if (/^\d{4}-\d{2}-\d{2}$/.test(pubRaw)) pub = new Date(pubRaw + 'T00:00:00.000Z');
    else if (/^\d{13}$/.test(pubRaw)) pub = new Date(Number(pubRaw));
    else if (/^\d{10}$/.test(pubRaw)) pub = new Date(Number(pubRaw) * 1000);
    if (pub && isNaN(pub.getTime())) pub = null;
    if (!pub) { noPub += 1; if (!pubSampleLogged && pubRaw) { console.log('未识别发布时间格式样本:', JSON.stringify(pubRaw)); pubSampleLogged = true; } }
    const data = {
      title: str(m.get('note_title')) || '(无标题)',
      noteType: str(m.get('note_type')) === '2' ? 'video' : 'normal',
      isRtbAdver: str(m.get('is_rtb_adver')) === '1' || str(m.get('is_rtb_adver')).includes('已推广'),
      exposure: num(m.get('imp_num')), views: num(m.get('read_feed_num')),
      likes: num(m.get('like_num')), collects: num(m.get('fav_num')),
      comments: num(m.get('cmt_num')), shares: num(m.get('share_num')),
      followCount: num(m.get('follow_num')),
      pmInquiries: num(m.get('message_open_cnt')), pmOpenings: num(m.get('message_driving_open_cnt')),
      pmLeads: num(m.get('msg_leads_num')), formLeads: num(m.get('leads_success')),
    };
    if (pub && !isNaN(pub.getTime())) data.publishTime = pub;
    await prisma.$executeRaw`INSERT INTO "KoxNote"
      ("noteId","brandId","accountId","title","noteType","isRtbAdver","publishTime","exposure","views","likes","collects","comments","shares","followCount","pmInquiries","pmOpenings","pmLeads","formLeads","authorName","updatedAt")
      VALUES (${noteId}, ${BRAND}, ${acct.id}, ${data.title}, ${data.noteType}, ${data.isRtbAdver}, ${data.publishTime ?? null}, ${data.exposure}, ${data.views}, ${data.likes}, ${data.collects}, ${data.comments}, ${data.shares}, ${data.followCount}, ${data.pmInquiries}, ${data.pmOpenings}, ${data.pmLeads}, ${data.formLeads}, ${authorName}, now())
      ON CONFLICT ("noteId") DO UPDATE SET
        "brandId"=${BRAND}, "accountId"=${acct.id}, "title"=${data.title}, "noteType"=${data.noteType}, "isRtbAdver"=${data.isRtbAdver}, "publishTime"=${data.publishTime ?? null},
        "exposure"=${data.exposure}, "views"=${data.views}, "likes"=${data.likes}, "collects"=${data.collects}, "comments"=${data.comments}, "shares"=${data.shares}, "followCount"=${data.followCount},
        "pmInquiries"=${data.pmInquiries}, "pmOpenings"=${data.pmOpenings}, "pmLeads"=${data.pmLeads}, "formLeads"=${data.formLeads}, "authorName"=${authorName}, "updatedAt"=now()`;
    upserted += 1;
    if (upserted % 500 === 0) console.log('已 upsert', upserted);
    await sleep(3);
  }
  console.log(`完成: 视图笔记=${seen.size} 监控账号匹配=${matched} KoxNote upsert=${upserted} 无发布时间=${noPub} 总耗时=${Math.round((Date.now()-t0)/1000)}s`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
