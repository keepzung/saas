// 二分调试：以原始 curDayRank 请求体为基准，逐步修改找出可用查询
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const state = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-tesla-state.json'), 'utf8'));
const ck = state.cookies
  .filter((c) => /xiaohongshu\.com/.test(c.domain))
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
const URL_ = 'https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list';

const base = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-dashboard-req.json'), 'utf8'));

const pick = (row, code) => {
  const list = row.targetList ?? row.targetVos ?? [];
  const hit = list.find((t) => t.targetCode === code);
  return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
};

async function tryBody(label, bodyObj) {
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: {
        Cookie: ck,
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://partner.xiaohongshu.com',
        Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
      },
      body: JSON.stringify(bodyObj),
    });
    const j = await r.json().catch(() => ({}));
    const vo = j?.data?.detailListVo ?? {};
    const rows = vo.detailDataList ?? vo.detailVoList ?? [];
    console.log(`[${label}] code=${j.code} total=${vo.total ?? '-'} rows=${rows.length}`);
    for (const row of rows.slice(0, 4)) {
      console.log('    ', JSON.stringify({
        industry: pick(row, 'first_ad_industry_name'),
        cost: pick(row, 'rank_cost'),
        inc: pick(row, 'rank_cost_increase'),
      }));
    }
    return rows;
  } catch (e) {
    console.log(`[${label}] ERR ${e.message.slice(0, 60)}`);
    return [];
  }
}

(async () => {
  // 0) 原体重放（应>0行）
  await tryBody('原体', base);

  // 1) 去 numberFilter（涨幅>0）
  const b1 = JSON.parse(JSON.stringify(base));
  b1.frontFilterList = b1.frontFilterList.filter((f) => f.filterField !== 'rank_cost_increase');
  const rows1 = await tryBody('去涨幅过滤', b1);

  // 2) 去 numberFilter + 行业过滤，按 rank_cost 排序
  const b2 = JSON.parse(JSON.stringify(b1));
  b2.frontFilterList = b2.frontFilterList.filter((f) => f.filterField !== 'first_ad_industry_code');
  b2.sorts = [{ sortField: 'rank_cost', sortType: 'desc' }];
  const rows2 = await tryBody('再去行业过滤+按消耗排序', b2);

  // 3) pageSize 拉满 + 日期改为昨日
  const b3 = JSON.parse(JSON.stringify(b2));
  b3.page = { pageNo: 1, pageSize: 50 };
  b3.frontFilterList[0].timeFilter.values = [b3.frontFilterList[0].timeFilter.values[0], b3.frontFilterList[0].timeFilter.values[0]];
  await tryBody('pageSize50+仅昨日', b3);

  // 4) 日期区间改为昨日~昨日（compFrontFilterList 同步）
  const b4 = JSON.parse(JSON.stringify(b2));
  b4.page = { pageNo: 1, pageSize: 50 };
  b4.frontFilterList[0].timeFilter.values = ['2026-09-25', '2026-09-25'];
  b4.compFrontFilterList = [];
  await tryBody('昨日单日+pageSize50', b4);

  // 5) 换 dynamicTargets 为常用指标（若 3/4 有行则这步测扩展列）
  const b5 = JSON.parse(JSON.stringify(b2));
  b5.page = { pageNo: 1, pageSize: 50 };
  b5.dynamicTargets = [
    'first_ad_industry_code',
    'first_ad_industry_name',
    'rank_cost',
    'imp_cnt',
    'click_cnt',
    'msg_leads_num',
  ];
  await tryBody('扩展指标列', b5);
  process.exit(0);
})();
