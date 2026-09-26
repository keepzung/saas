// 用与 spark-api.client.ts 完全一致的 noteList body 探测特斯拉组织可见性
const fs = require('fs');
const path = require('path');
const TAG = process.env.TAG || 'tesla';
const state = JSON.parse(fs.readFileSync(path.join(__dirname, `state/auth-${TAG}.json`), 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://mcc.xiaohongshu.com';
const H = { Cookie: ck, 'User-Agent': UA, Referer: `${BASE}/micro/note-data`, 'Content-Type': 'application/json', Origin: BASE };

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const monthAgo = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - 29 * 86400000)
  .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

const noteBody = {
  viewAlias: 'mcc_assets_creativityContent_noteAnalysisView',
  chart: 'noteList',
  dynamicTargets: [
    'note_id',
    'note_title',
    'note_publish_time',
    'author_name',
    'brand_user_name',
    'note_status',
    'note_type',
    'is_rtb_adver',
    'staff_city',
    'staff_label',
    'imp_num',
    'read_feed_num',
    'like_num',
    'cmt_num',
    'fav_num',
    'share_num',
    'follow_num',
    'engage_num',
  ],
  sorts: [],
  page: { pageNo: 1, pageSize: 5 },
  frontFilterList: [
    {
      filterField: 'time_dim',
      filterFieldName: '时间维度',
      filterType: 20,
      selectFilter: {
        selectType: 10,
        selectShowType: 0,
        valueSource: 0,
        selectLabels: [{ selected: 1, labelValue: 'all_key', labelName: '合计' }],
      },
    },
    {
      filterField: 'date_key',
      filterFieldName: '笔记数据范围',
      filterType: 10,
      timeFilter: {
        pattern: 30,
        timeShowType: 11,
        disableRange: 0,
        limitMax: 366,
        quickDates: [6, 16, 21, 36, 41, 46, 51],
        values: [monthAgo, today],
      },
    },
    {
      filterField: 'is_rtb_adver',
      filterFieldName: '推广状态',
      filterType: 20,
      selectFilter: {
        selectType: 20,
        selectShowType: 0,
        valueSource: 1,
        selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }],
      },
    },
    {
      filterField: 'content_type',
      filterFieldName: '笔记来源',
      filterType: 20,
      selectFilter: {
        selectType: 20,
        selectShowType: 0,
        valueSource: 1,
        selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }],
      },
    },
    {
      filterField: 'note_type',
      filterFieldName: '笔记类型',
      filterType: 20,
      selectFilter: {
        selectType: 20,
        selectShowType: 0,
        valueSource: 1,
        selectLabels: [{ selected: 1, labelValue: '全部', labelName: '全部' }],
      },
    },
  ],
};

function pickTarget(row, code) {
  if (row[code] !== undefined && row[code] !== null && row[code] !== '') return row[code];
  const list = Array.isArray(row.targetList) ? row.targetList : row.targetVos ?? [];
  const hit = list.find((t) => t.targetCode === code);
  if (!hit) return undefined;
  return hit.targetValue ?? hit.targetOriginValue ?? hit.targetDownloadValue;
}

(async () => {
  const r = await fetch(`${BASE}/api/vision/mcc_dashboard/target_detail_list`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(noteBody),
  });
  const j = await r.json().catch(() => ({}));
  const vo = j?.data?.detailListVo ?? {};
  const rows = vo.detailDataList ?? vo.detailVoList ?? [];
  console.log('vision noteList:', r.status, 'code=' + j.code, 'total=', vo.total, 'rows=', rows.length);
  const orgs = new Set();
  for (const row of rows.slice(0, 5)) {
    console.log('  样例:', JSON.stringify({
      title: String(pickTarget(row, 'note_title') ?? '').slice(0, 26),
      author: pickTarget(row, 'author_name'),
      brand: pickTarget(row, 'brand_user_name'),
      rtb: pickTarget(row, 'is_rtb_adver'),
      imp: pickTarget(row, 'imp_num'),
    }));
    for (const v of Object.values(row)) {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
      const m = s.match(/\d{19}/);
      if (m) orgs.add(m[0]);
    }
  }
  console.log('行内19位数(可能是org):', orgs.size ? [...orgs] : '无');

  // ticket 来源线索
  const t = fs.readFileSync(path.join(__dirname, 'state', 'mcc-js', 'index.275ebbc1.js'), 'utf8');
  let i = t.indexOf('ticket');
  let n = 0;
  while (i >= 0 && n < 6) {
    const ctxText = t.slice(Math.max(0, i - 200), i + 120).replace(/\s+/g, ' ');
    if (/GET_ACCOUNT_LIST|auth_accounts|organization/.test(ctxText)) {
      console.log('ticket ctx:', ctxText.slice(0, 260));
      n += 1;
    }
    i = t.indexOf('ticket', i + 6);
  }
})();
