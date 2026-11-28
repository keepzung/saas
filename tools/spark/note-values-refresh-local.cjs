#!/usr/bin/env node
// KoxNote 数值列轻刷(合并版,2026-11-25 起):原 df/mdd 两份同构脚本合一。
// 拉取品牌自己的聚光笔记分析(MCC,all_key 累计),只更新数值列+noteUrl/封面,不动元数据;
// 附:无标题回填(抓笔记页正文首行,限速防风控;按品牌开关)。
// 用法: node note-values-refresh.cjs --brand=7 [--titles-max=30]  (幂等;成败均写 SparkSyncLog)
// 品牌差异来源 backend/src/brand/brand-profiles.ts:
//   notes.noteSources → content_type 过滤(MDD=仅员工笔记,其余全量)
//   titles 回填目前仅 brand7(2026-11-25 前的既有行为,需要扩展时改 TITLES_BRANDS)
// deploy 包装: cron-sync-note-values-refresh.sh <brandId>
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const BACKEND_DIR = 'C:/Users/Ning/Desktop/马克听/saas/backend'; // 本机执行版
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
for (const l of fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const p = new PrismaClient();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const argOf = (k, d) => { const i = process.argv.indexOf(k); if (i > -1) return process.argv[i + 1]; const eq = process.argv.find((a) => a.startsWith(k + '=')); return eq ? eq.slice(k.length + 1) : d; };
const BRAND = Number(argOf('--brand', '7'));
// 与 brand-profiles.ts notes.noteSources 对齐(独立脚本不引 TS,改动需两处同步)
const NOTE_SOURCES = { 5: ['员工笔记'] };
const TITLES_BRANDS = [7];
const mk = (label) => ({ selected: 1, labelValue: label, labelName: label });
const pick = (r, code) => {
  if (r[code] !== undefined && r[code] !== null && r[code] !== '') return r[code];
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  const hit = list.find((t) => t.targetCode === code);
  return hit ? (hit.targetValue ?? hit.targetOriginValue ?? hit.targetDownloadValue) : undefined;
};
// first_file_id 等附件字段不在 targetList 顶层,藏在条目的 linkVos 里
const pickDeep = (r, code) => {
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  const all = [];
  for (const t of list) {
    all.push(t);
    if (Array.isArray(t.linkVos)) all.push(...t.linkVos);
  }
  const hit = all.find((t) => t?.targetCode === code);
  return hit ? String(hit.targetValue ?? hit.targetOriginValue ?? '').trim() : undefined;
};
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const PAGES = Number(argOf('--pages', '200')); // 平台支持长分页;荣威 5.9 万篇需 ~118 页
const TARGETS = ['note_id', 'imp_num', 'read_feed_num', 'like_num', 'cmt_num', 'fav_num', 'share_num', 'follow_num', 'ziran_imp_cnt', 'ziran_read_cnt', 'ads_rtb_engage_cnt', 'message_open_cnt', 'message_driving_open_cnt', 'msg_leads_num'];
const dayStr = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
// SparkSyncLog.statDate 是 String 列,传 Date 对象会被 Prisma 拒绝且静默失败
const todayKey = () => dayStr(0);

async function pullAll(cookie) {
  const rows = [];
  for (let page = 1; page <= PAGES; page++) {
    const body = {
      viewAlias: 'mcc_assets_creativityContent_noteAnalysisView', chart: 'noteList', sorts: [],
      dynamicTargets: TARGETS,
      page: { pageNo: page, pageSize: 500 },
      frontFilterList: [
        { filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [mk('all_key')] } },
        { filterField: 'note_publish_date', filterFieldName: '笔记发布日期', filterType: 10, timeFilter: { pattern: 10, timeShowType: 11, disableRange: 1, limitMax: 366, quickDates: [6], values: [dayStr(-365), dayStr(0)] } },
        { filterField: 'is_rtb_adver', filterFieldName: '推广状态', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [mk('全部')] } },
        { filterField: 'note_type', filterFieldName: '笔记类型', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [mk('全部')] } },
      ],
    };
    if (NOTE_SOURCES[BRAND]) {
      body.frontFilterList.push({ filterField: 'content_type', filterFieldName: '笔记来源', filterType: 20, selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: NOTE_SOURCES[BRAND].map(mk) } });
    }
    const res = await fetch('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'User-Agent': UA, Origin: 'https://mcc.xiaohongshu.com', Referer: 'https://mcc.xiaohongshu.com/micro/note-data' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!j || (j.code !== 0 && j.success !== true)) throw new Error(`MCC API ${res.status}: ${JSON.stringify(j).slice(0, 100)}`);
    const d = j.data?.detailListVo ?? {};
    const list = d.detailDataList ?? d.detailVoList ?? [];
    rows.push(...list);
    if (rows.length >= (d.total ?? 0) || list.length < 500) break;
  }
  return rows;
}

(async () => {
  let valuesError = null, valuesMsg = '';
  let rows = [], updated = 0, missing = 0;
  try {
    const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
    if (!cfg?.cookie) throw new Error(`brand${BRAND} 无 cookie`);
    rows = await pullAll(cfg.cookie);
    for (const r of rows) {
      const noteId = String(pick(r, 'note_id') ?? '').trim();
      if (!noteId) continue;
      const data = {
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
        // 私信三数=笔记明细分析·私信咨询/开口/留资数(随轻刷对齐页面)
        pmInquiries: num(pick(r, 'message_open_cnt')),
        pmOpenings: num(pick(r, 'message_driving_open_cnt')),
        pmLeads: num(pick(r, 'msg_leads_num')),
      };
      const found = await p.koxNote.findFirst({ where: { brandId: BRAND, noteId }, select: { id: true, coverUrl: true } });
      if (!found) { missing += 1; continue; }
      // note_link 每次报表都带新 xsec_token:顺带刷新 noteUrl,供无标题回填抓页面用(旧 token 会过期 404)
      const freshUrl = String(pick(r, 'note_link') ?? '').trim();
      // 封面:first_file_id → xhscdn 直链,coverUrl 为空才写(不抓页面无风控)
      const fid = pickDeep(r, 'first_file_id');
      const cover = fid && !found.coverUrl ? `https://sns-img-hw.xhscdn.com/${fid}?imageView2/2/w/480/format/jpeg` : undefined;
      await p.koxNote.update({
        where: { id: found.id },
        data: { ...data, ...(freshUrl ? { noteUrl: freshUrl } : {}), ...(cover ? { coverUrl: cover } : {}) },
      });
      updated += 1;
    }
    valuesMsg = `values refreshed: mcc_rows=${rows.length} updated=${updated} not_in_db=${missing}`;
    console.log(valuesMsg);
    await p.sparkSyncLog.create({ data: { brandId: BRAND, syncType: 'note_values_refresh', statDate: todayKey(), status: 'success', fetched: rows.length, upserted: updated, message: valuesMsg } }).catch(() => {});
  } catch (e) {
    valuesError = e;
    console.error(`values skipped: ${e.message}`);
    await p.sparkSyncLog.create({ data: { brandId: BRAND, syncType: 'note_values_refresh', statDate: todayKey(), status: 'failed', fetched: 0, upserted: 0, message: `values skipped: ${e.message.slice(0, 150)}` } }).catch(() => {});
  }

  // ── 无标题回填:抓笔记页 meta description(正文首行),去尾部话题标签后作为展示标题 ──
  // (按品牌开关:目前与合并前行为一致,仅 brand7)
  if (!TITLES_BRANDS.includes(BRAND)) {
    await p.$disconnect();
    if (valuesError) process.exit(1);
    process.exit(0);
  }
  const tArg = process.argv.find((a) => a.startsWith('--titles-max='));
  const TITLES_MAX = Number(tArg ? tArg.split('=')[1] : '') || 20;
  const stripTags = (s) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\[话题\]#/g, '')
      .replace(/^(?:\s*#[^\s#]+)+\s*/, '')
      .replace(/(?:\s*#[^\s#]+)+\s*$/g, '')
      .replace(/\s+#\s*$/, '')
      .trim();
  let filled = 0, skipped = 0;
  const pending = await p.koxNote.findMany({
    where: { brandId: BRAND, title: '(无标题)', noteUrl: { not: null } },
    select: { id: true, noteUrl: true },
    orderBy: { id: 'desc' },
    take: TITLES_MAX,
  });
  for (const n of pending) {
    try {
      const res = await fetch(n.noteUrl, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const m =
        html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
        html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i);
      const t = stripTags(m?.[1] ?? '');
      if (t.length > 4) {
        await p.koxNote.update({ where: { id: n.id }, data: { title: t.slice(0, 60) } });
        filled += 1;
      } else skipped += 1;
    } catch {
      skipped += 1;
    }
    await new Promise((r) => setTimeout(r, 1200)); // 限速防风控(抓页面比 API 敏感,批量抓取会触发盾)
  }
  if (pending.length) console.log(`titles backfilled: filled=${filled} skipped=${skipped}`);
  await p.$disconnect();
  if (valuesError) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
