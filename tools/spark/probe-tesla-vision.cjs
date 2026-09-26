// 特斯拉 cookie 能力探测：vision 笔记接口（免 orgCode）+ config/constant 端点
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
    'is_rtb_adver',
    'imp_num',
    'read_feed_num',
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
  ],
};

(async () => {
  const r = await fetch(`${BASE}/api/vision/mcc_dashboard/target_detail_list`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(noteBody),
  });
  const j = await r.json().catch(() => ({}));
  const vo = j?.data?.detailListVo ?? {};
  const rows = vo.detailDataList ?? vo.detailVoList ?? [];
  console.log('vision noteList:', r.status, 'code=' + j.code, 'total=', vo.total);
  for (const row of rows.slice(0, 3)) {
    const pick = (c) => {
      const list = row.targetList ?? [];
      const hit = list.find((t) => t.targetCode === c);
      return hit?.targetValue ?? hit?.targetOriginValue ?? row[c];
    };
    console.log('  样例:', JSON.stringify({
      title: String(pick('note_title') ?? '').slice(0, 24),
      author: pick('author_name'),
      brand: pick('brand_user_name'),
      rtb: pick('is_rtb_adver'),
      imp: pick('imp_num'),
    }));
  }
  for (const p of ['/api/mcc/user/config', '/api/mcc/common/constant']) {
    try {
      const r2 = await fetch(BASE + p, { headers: H });
      const t2 = await r2.text();
      const orgHit = t2.match(/\d{19}/g);
      console.log(`[${p}] ${r2.status} len=${t2.length} 19位数:`, orgHit ? orgHit.slice(0, 5) : '无');
    } catch (e) {
      console.log(`[${p}] ERR ${e.message}`);
    }
  }
})();
