#!/usr/bin/env node
// MCC 笔记日维度(NDKoxNoteDailyStat)定窗口回补工具 —— 独立于 backend HTTP 同步路径:
//   - 直连 noteAnalysis 视图分页拉取, 逐页即时 upsert(不整窗堆积, 规避 backend 100k 行
//     整窗内存累积在 3GB 小机上偶发 OOM 的问题)
//   - 窗口由 --start/--end 显式指定(backend syncNoteDaily 固定 statDate 往前 30 天, 无法精确对齐),
//     建议每次 ≤17 天(格力日均 ~5.3k 行, 需 < 200页×500 行分页上限; 且窗口 ≤33 天保 ziran_* 自然列不被平台置零)
//   - 幂等可重跑(upsert by brandId+noteId+day)
// 用法: node backfill-nds-window.cjs --brand=8 --start=2026-08-01 --end=2026-08-14
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BRAND = Number((process.argv.find((a) => a.startsWith('--brand=')) || '--brand=8').split('=')[1]);
const START = (process.argv.find((a) => a.startsWith('--start=')) || '').split('=')[1] || '';
const END = (process.argv.find((a) => a.startsWith('--end=')) || '').split('=')[1] || '';
if (!START || !END || !/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END)) {
  console.error('用法: node backfill-nds-window.cjs --brand=8 --start=YYYY-MM-DD --end=YYYY-MM-DD');
  process.exit(2);
}

const MCC_BASE = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const org = await prisma.sparkOrgConfig.findUnique({ where: { brandId: BRAND } });
  if (!org?.cookie) throw new Error(`brand ${BRAND} 无 SparkOrgConfig/cookie`);
  const cookie = org.cookie;

  const accounts = await prisma.kosAccount.findMany({
    where: { brandId: BRAND },
    select: { id: true, nickname: true, authorId: true },
  });
  const byNickname = new Map(accounts.filter((a) => a.nickname).map((a) => [a.nickname, a.id]));
  const byAuthorUid = new Map(
    accounts.filter((a) => /^[0-9a-f]{24}$/.test(a.authorId)).map((a) => [a.authorId, a.id]),
  );

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
    const s = String(v ?? '').replace(/,/g, '').trim();
    if (!s || s === '-' || s === '--') return 0;
    if (/万$/.test(s)) return Math.round(parseFloat(s) * 10000) || 0;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const str = (v) => String(v ?? '').trim();
  const bool = (v) => {
    const s = str(v);
    if (!s) return null;
    return s === '1' || s.toLowerCase() === 'true' || s.includes('已推广');
  };
  const rowMap = (r) => {
    const m = new Map();
    const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
    for (const t of list ?? []) {
      const v = t.targetValue ?? t.targetOriginValue ?? t.targetDownloadValue;
      if (v != null && v !== '') m.set(String(t.targetCode), v);
    }
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'targetList' && k !== 'targetVos' && v != null && v !== '') m.set(k, v);
    }
    return m;
  };

  async function fetchPage(pageNo) {
    const body = {
      viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
      chart: 'noteList',
      dynamicTargets: [
        'date_key', 'note_id', 'note_title', 'note_publish_time', 'author_name',
        'brand_user_name', 'note_status', 'note_type', 'is_rtb_adver',
        'staff_city', 'staff_label', 'huati_tag_list',
        'imp_num', 'read_feed_num', 'like_num', 'cmt_num', 'fav_num', 'share_num', 'follow_num', 'engage_num',
        'ziran_imp_cnt', 'ziran_read_cnt', 'ads_rtb_engage_cnt',
        'ads_rtb_imp_cnt', 'ads_rtb_click_cnt',
        'message_open_cnt', 'message_driving_open_cnt', 'msg_leads_num', 'leads_success',
      ],
      sorts: [],
      page: { pageNo, pageSize: 500 },
      frontFilterList: [
        {
          filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20,
          selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ selected: 1, labelValue: 'date_key', labelName: '日维度' }] },
        },
        {
          filterField: 'date_key', filterFieldName: '笔记数据范围', filterType: 10,
          timeFilter: { pattern: 30, timeShowType: 11, disableRange: 0, limitMax: 366, quickDates: [6, 16, 21, 36, 41, 46, 51], values: [START, END] },
        },
        {
          filterField: 'is_rtb_adver', filterFieldName: '推广状态', filterType: 20,
          selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] },
        },
        {
          filterField: 'content_type', filterFieldName: '笔记来源', filterType: 20,
          selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] },
        },
        {
          filterField: 'note_type', filterFieldName: '笔记类型', filterType: 20,
          selectFilter: { selectType: 20, selectShowType: 0, valueSource: 1, selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }] },
        },
      ],
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let res;
      try {
        res = await fetch(`${MCC_BASE}/api/vision/mcc_dashboard/target_detail_list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
            'User-Agent': UA,
            Origin: MCC_BASE,
            Referer: `${MCC_BASE}/micro/note-data`,
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt === 3) throw new Error(`网络错误×3: ${e.message}`);
        await sleep(3000 * attempt);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error('cookie 已失效(401/403), 请先 assist-login 续登');
      let json;
      try {
        json = await res.json();
      } catch {
        if (attempt === 3) throw new Error(`响应非 JSON (HTTP ${res.status})`);
        await sleep(3000 * attempt);
        continue;
      }
      if (json.code !== 0 && json.success !== true) throw new Error(`API 错误 code=${json.code} msg=${json.msg ?? json.message}`);
      const vo = json.data?.detailListVo ?? {};
      return { total: vo.total ?? 0, rows: vo.detailDataList ?? vo.detailVoList ?? [] };
    }
  }

  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] backfill brand=${BRAND} window=${START}~${END} start`);
  let total = 0;
  let upserted = 0;
  let invalid = 0;
  const seenDays = new Map();
  for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
    const { total: apiTotal, rows } = await fetchPage(pageNo);
    if (pageNo === 1) {
      total = apiTotal;
      console.log(`[${new Date().toISOString()}] platform total=${total} (分页上限 200页×500=100000)`);
      if (total > 100000) console.warn(`!! 窗口行数超分页上限, 本轮回补不完整, 请拆小窗口重跑`);
    }
    if (!rows.length) break;
    for (const r of rows) {
      const m = rowMap(r);
      const noteId = str(m.get('note_id'));
      const dayStr = str(m.get('date_key'));
      if (!noteId || !/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) { invalid += 1; continue; }
      seenDays.set(dayStr, (seenDays.get(dayStr) ?? 0) + 1);
      const authorName = str(m.get('author_name')) || null;
      const authorUid = str(m.get('author_id')) || null;
      const accountId = (authorUid ? byAuthorUid.get(authorUid) : undefined) ?? (authorName ? byNickname.get(authorName) ?? null : null);
      const data = {
        title: str(m.get('note_title')) || null,
        authorName,
        accountId,
        noteType: str(m.get('note_type')) === '2' ? 'video' : 'normal',
        isRtbAdver: bool(m.get('is_rtb_adver')),
        exposure: num(m.get('imp_num')),
        views: num(m.get('read_feed_num')),
        likes: num(m.get('like_num')),
        collects: num(m.get('fav_num')),
        comments: num(m.get('cmt_num')),
        shares: num(m.get('share_num')),
        followCount: num(m.get('follow_num')),
        naturalExposure: num(m.get('ziran_imp_cnt')),
        naturalViews: num(m.get('ziran_read_cnt')),
        rtbEngage: num(m.get('ads_rtb_engage_cnt')),
        rtbImp: num(m.get('ads_rtb_imp_cnt')),
        rtbClick: num(m.get('ads_rtb_click_cnt')),
        pmInquiries: num(m.get('message_open_cnt')),
        pmOpenings: num(m.get('message_driving_open_cnt')),
        pmLeads: num(m.get('msg_leads_num')),
        formLeads: num(m.get('leads_success')),
      };
      const day = new Date(`${dayStr}T00:00:00.000Z`);
      await prisma.koxNoteDailyStat.upsert({
        where: { brandId_noteId_day: { brandId: BRAND, noteId, day } },
        create: { brandId: BRAND, noteId, day, ...data },
        update: data,
      });
      upserted += 1;
    }
    const days = [...seenDays.keys()].sort();
    console.log(`[${new Date().toISOString()}] page=${pageNo} +${rows.length} cum_upserted=${upserted} days=${days[0]}~${days[days.length - 1]}(${seenDays.size})`);
    if (upserted + invalid >= total) break;
  }
  console.log(`[${new Date().toISOString()}] done brand=${BRAND} window=${START}~${END} total=${total} upserted=${upserted} invalid=${invalid} 耗时=${Math.round((Date.now() - t0) / 1000)}s`);
}

main()
  .catch((e) => { console.error(`[${new Date().toISOString()}] FAILED: ${e.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
