#!/usr/bin/env node
// 东风(brand7) KoxNote 数值列高频刷新：与 mdd-note-values-refresh.cjs 同款拉数逻辑，
// 拉取东风自己的聚光（SparkOrgConfig.brandId=7 cookie），只更新数值列不动元数据。
// 与 MDD 的差异：东风 syncNotes 不限笔记来源（专业号/员工等全量），故此处不加 content_type 过滤。
// 发布窗口=滚动近 365 天（视图上限 366）覆盖全量笔记——老笔记的私信数会被平台滞后回填，窗口过窄会漏刷。
// 附：无标题回填——员工发笔记不填标题时聚光报表 note_title 为空，系统记为「(无标题)」；
//     此处抓笔记页取正文首行（meta description 去掉尾部话题标签）作为展示标题，限速防风控。
// 用法: node df-note-values-refresh.cjs [--titles-max=30]   （幂等；成败均写 SparkSyncLog）
//   --titles-max=30  每轮最多回填篇数（cron 默认 30；首次存量补齐手动传 400）
// deploy 用户 crontab：*/30 * * * * /opt/saas/deploy/cron-sync-df-values-refresh.sh
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const BACKEND_DIR = path.join('/opt/saas', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
for (const l of fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const p = new PrismaClient();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const BRAND = 7;
const mk = (label) => ({ selected: 1, labelValue: label, labelName: label });
const pick = (r, code) => {
  if (r[code] !== undefined && r[code] !== null && r[code] !== '') return r[code];
  const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
  const hit = list.find((t) => t.targetCode === code);
  return hit ? (hit.targetValue ?? hit.targetOriginValue ?? hit.targetDownloadValue) : undefined;
};
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const TARGETS = ['note_id', 'imp_num', 'read_feed_num', 'like_num', 'cmt_num', 'fav_num', 'share_num', 'follow_num', 'ziran_imp_cnt', 'ziran_read_cnt', 'ads_rtb_engage_cnt', 'message_open_cnt', 'message_driving_open_cnt', 'msg_leads_num'];
const dayStr = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
// SparkSyncLog.statDate 是 String 列，传 Date 对象会被 Prisma 拒绝且静默失败
const todayKey = () => dayStr(0);

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
      ],
    };
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
  const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
  if (!cfg?.cookie) throw new Error(`brand${BRAND} 无 cookie`);
  const rows = await pullAll(cfg.cookie);
  let updated = 0, missing = 0;
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
      // 私信三数=笔记明细分析·私信咨询/开口/留资数（随轻刷对齐页面）
      pmInquiries: num(pick(r, 'message_open_cnt')),
      pmOpenings: num(pick(r, 'message_driving_open_cnt')),
      pmLeads: num(pick(r, 'msg_leads_num')),
    };
    const found = await p.koxNote.findFirst({ where: { brandId: BRAND, noteId }, select: { id: true } });
    if (!found) { missing += 1; continue; }
    await p.koxNote.update({ where: { id: found.id }, data });
    updated += 1;
  }
  const msg = `values refreshed: mcc_rows=${rows.length} updated=${updated} not_in_db=${missing}`;
  console.log(msg);

  // ── 无标题回填：抓笔记页 meta description（正文首行），去尾部话题标签后作为展示标题 ──
  const tArg = process.argv.find((a) => a.startsWith('--titles-max='));
  const TITLES_MAX = Number(tArg ? tArg.split('=')[1] : '') || 30;
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
    await new Promise((r) => setTimeout(r, 400)); // 限速防风控
  }
  if (pending.length) console.log(`titles backfilled: filled=${filled} skipped=${skipped}`);
  const finalMsg = `${msg}; titles: pending=${pending.length} filled=${filled} skipped=${skipped}`;
  await p.sparkSyncLog.create({ data: { brandId: BRAND, syncType: 'note_values_refresh', statDate: todayKey(), status: 'success', fetched: rows.length, upserted: updated, message: finalMsg.slice(0, 490) } }).catch(() => {});
})().catch(async (e) => {
  console.error(`FAIL: ${e.message}`);
  await p.sparkSyncLog.create({ data: { brandId: BRAND, syncType: 'note_values_refresh', statDate: todayKey(), status: 'failed', fetched: 0, upserted: 0, message: `FAIL: ${e.message}`.slice(0, 490) } }).catch(() => {});
  process.exit(1);
}).finally(() => p.$disconnect());
