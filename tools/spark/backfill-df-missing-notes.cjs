#!/usr/bin/env node
// 奕境(brand7) 缺失笔记主表回填：MCC 笔记分析报表(all_key 累计口径)里有、KoxNote 主表没有的
// 笔记(死窗漏天 / 游标洞)——按 noteId 补插。带 authorName/账号 UID 归属/封面 fid/noteUrl(xsec_token)。
// values-refresh 每轮报的 not_in_db 就是本脚本的目标集合，回填后应归零。
// 用法: node backfill-df-missing-notes.cjs [--brand=7] [--apply]   (默认 dry-run 只统计)
// 需 brand MCC cookie 有效(21:30 例程后跑);退出码 2 = 会话失效
const { createRequire } = require('module');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const argOf = (k, d) => { const i = process.argv.indexOf(k); if (i > -1) return process.argv[i + 1]; const eq = process.argv.find((a) => a.startsWith(k + '=')); return eq ? eq.slice(k.length + 1) : d; };
const BRAND = Number(argOf('--brand', '7'));
const APPLY = process.argv.includes('--apply');
const SOURCES = (argOf('--source', '') || '').split(',').map(x => x.trim()).filter(Boolean);
const MONITOR_SCOPE = process.argv.includes('--monitor-scope'); // 格力等监控口径品牌:只收录基线账号(authorId 命中 kosAccount)的笔记
const mk = (label) => ({ selected: 1, labelValue: label, labelName: label });
const TARGETS = ['note_id', 'note_title', 'note_publish_time', 'author_name', 'author_id', 'note_link', 'first_file_id', 'imp_num', 'read_feed_num', 'like_num', 'cmt_num', 'fav_num', 'share_num', 'follow_num', 'ziran_imp_cnt', 'ziran_read_cnt', 'ads_rtb_engage_cnt', 'message_open_cnt', 'message_driving_open_cnt', 'msg_leads_num'];
const dayStr = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const pick = (r, code) => {
  if (r[code] !== undefined && r[code] !== null && r[code] !== '') return r[code];
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  const all = [];
  for (const t of list) {
    all.push(t);
    if (Array.isArray(t.linkVos)) all.push(...t.linkVos);
  }
  const hit = all.find((t) => t?.targetCode === code);
  return hit ? (hit.targetValue ?? hit.targetOriginValue ?? hit.targetDownloadValue) : undefined;
};
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

async function pullAll(cookie) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const body = {
      viewAlias: 'mcc_assets_creativityContent_noteAnalysisView', chart: 'noteList', sorts: [],
      dynamicTargets: TARGETS,
      page: { pageNo: page, pageSize: 500 },
      frontFilterList: [
        { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [mk('all_key')] } },
        { filterField: 'note_publish_date', filterFieldName: '笔记发布日期', filterType: 10, timeFilter: { pattern: 10, timeShowType: 11, disableRange: 1, limitMax: 366, quickDates: [6], values: [dayStr(-365), dayStr(0)] } },
        { filterField: 'is_rtb_adver', filterFieldName: '推广状态', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [mk('全部')] } },
        { filterField: 'note_type', filterFieldName: '笔记类型', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [mk('全部')] } },
        ...(SOURCES.length ? [{ filterField: 'content_type', filterFieldName: '笔记来源', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: SOURCES.map(mk) } }] : []),
      ],
    };
    const res = await fetch('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'User-Agent': UA, Origin: 'https://mcc.xiaohongshu.com', Referer: 'https://mcc.xiaohongshu.com/micro/note-data' },
      body: JSON.stringify(body),
    });
    if (res.status === 401) throw Object.assign(new Error('MCC 会话失效(401)'), { code: 'COOKIE_DEAD' });
    const j = await res.json().catch(() => null);
    if (!j || (j.code !== 0 && j.success !== true)) throw new Error(`MCC API ${res.status}: ${JSON.stringify(j).slice(0, 120)}`);
    const d = j.data?.detailListVo ?? {};
    const list = d.detailDataList ?? d.detailVoList ?? [];
    rows.push(...list);
    if (rows.length >= (d.total ?? 0) || list.length < 500) break;
  }
  return rows;
}

(async () => {
  const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
  if (!cfg?.cookie) { console.error(`brand${BRAND} 无 cookie`); process.exit(2); }
  const rows = await pullAll(cfg.cookie).catch((e) => {
    console.error(`拉取失败: ${e.message}`);
    process.exit(e.code === 'COOKIE_DEAD' ? 2 : 1);
  });
  console.log(`报表 ${rows.length} 行 (brand${BRAND}, ${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  const accounts = await p.kosAccount.findMany({
    where: { brandId: BRAND },
    select: { id: true, authorId: true, nickname: true },
  });
  const monitorUids = MONITOR_SCOPE ? new Set(accounts.filter((a) => /^[0-9a-f]{24}$/.test(a.authorId)).map((a) => a.authorId)) : null;
  const byUid = new Map(accounts.filter((a) => /^[0-9a-f]{24}$/.test(a.authorId)).map((a) => [a.authorId, a.id]));
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  let exist = 0, inserted = 0, noId = 0, skipped = 0;
  for (const r of rows) {
    const noteId = String(pick(r, 'note_id') ?? '').trim();
    if (!noteId) { noId++; continue; }
    const found = await p.koxNote.findFirst({ where: { brandId: BRAND, noteId }, select: { id: true } });
    if (found) { exist++; continue; }
    const authorName = String(pick(r, 'author_name') ?? '').trim();
    const authorUid2 = String(pick(r, 'author_id') ?? '').trim();
    if (MONITOR_SCOPE && (!authorUid2 || !monitorUids.has(authorUid2))) { skipped++; continue; }
    const authorUid = String(pick(r, 'author_id') ?? '').trim();
    const title = String(pick(r, 'note_title') ?? '').trim() || '(无标题)';
    const pubRaw = String(pick(r, 'note_publish_time') ?? '').trim();
    const publishTime = pubRaw ? new Date(pubRaw.replace(/-/g, '/') + '+08:00') : null;
    const noteUrl = String(pick(r, 'note_link') ?? '').trim();
    const fid = String(pick(r, 'first_file_id') ?? '').trim();
    const data = {
      brandId: BRAND,
      accountId: byUid.get(authorUid) ?? null,
      title,
      noteUrl: noteUrl || null,
      publishTime: Number.isNaN(publishTime?.getTime?.()) ? null : publishTime,
      exposure: num(pick(r, 'imp_num')),
      views: num(pick(r, 'read_feed_num')),
      likes: num(pick(r, 'like_num')),
      comments: num(pick(r, 'cmt_num')),
      collects: num(pick(r, 'fav_num')),
      shares: num(pick(r, 'share_num')),
      followCount: num(pick(r, 'follow_num')),
      naturalExposure: num(pick(r, 'ziran_imp_cnt')),
      naturalViews: num(pick(r, 'ziran_read_cnt')),
      rtbEngage: num(pick(r, 'ads_rtb_engage_cnt')),
      pmInquiries: num(pick(r, 'message_open_cnt')),
      pmOpenings: num(pick(r, 'message_driving_open_cnt')),
      pmLeads: num(pick(r, 'msg_leads_num')),
      authorName: authorName || null,
      accountType: 'KOS',
      statDate: new Date(`${todayKey}T00:00:00.000Z`),
      rawJson: r,
      ...(fid ? { coverUrl: `https://sns-img-hw.xhscdn.com/${fid}?imageView2/2/w/480/format/jpeg` } : {}),
    };
    if (APPLY) await p.koxNote.create({ data: { noteId, ...data } });
    inserted++;
    if (inserted <= 5) console.log(`  缺失样例: ${noteId} pub=${pubRaw || '?'} author=${authorName || '?'} views=${data.views}`);
  }
  console.log(`完成: 报表${rows.length} · 已在库${exist} · 缺失${inserted}${APPLY ? '(已插入)' : '(dry-run 未写)'} · 无noteId${noId}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
