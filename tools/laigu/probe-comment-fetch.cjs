// 纯 fetch 重放评论接口（无浏览器）：token 头 + 宽时间窗 + 大分页
const TOKEN = '965a57ee9299dd88dd45320c31e7a05508f31a864e98d50c17e5b020f9ecec41';
const BASE = 'https://api-gateway-ali.meiqia.cn';

const call = async (p, body) => {
  const res = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: TOKEN,
      Origin: 'https://pro.laigu.com',
      Referer: 'https://pro.laigu.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ nonJson: res.status }));
};

(async () => {
  // 1) 单页
  const r1 = await call('/spectrum/workbench/redbook/comment/list', {
    curPage: 1, size: 5, keyword: '', channelCorpIds: [],
    beginCreatedAt: '2026-09-29T16:00:00.000Z', endCreatedAt: '2026-09-30T15:59:59.999Z', replyState: [],
  });
  console.log('[1day p1]', JSON.stringify(r1).slice(0, 200));

  // 2) 30 天 + size 100
  const r2 = await call('/spectrum/workbench/redbook/comment/list', {
    curPage: 1, size: 100, keyword: '', channelCorpIds: [],
    beginCreatedAt: '2026-08-31T16:00:00.000Z', endCreatedAt: '2026-09-30T15:59:59.999Z', replyState: [],
  });
  const rows = r2?.data?.data ?? [];
  console.log('[30d p1] total=', r2?.data?.totalNum, 'totalPage=', r2?.data?.totalPage, 'rows=', rows.length);
  if (rows.length) {
    console.log('字段:', JSON.stringify(Object.keys(rows[0])));
    console.log('样例:', JSON.stringify(rows[0]).slice(0, 400));
    const replyStateDist = {};
    for (const r of rows) replyStateDist[r.replyState] = (replyStateDist[r.replyState] ?? 0) + 1;
    console.log('回复状态分布:', JSON.stringify(replyStateDist));
    // 全量翻页统计
    const totalPage = r2?.data?.totalPage ?? 1;
    let all = rows.length;
    for (let p = 2; p <= totalPage; p++) {
      const rp = await call('/spectrum/workbench/redbook/comment/list', {
        curPage: p, size: 100, keyword: '', channelCorpIds: [],
        beginCreatedAt: '2026-08-31T16:00:00.000Z', endCreatedAt: '2026-09-30T15:59:59.999Z', replyState: [],
      });
      all += (rp?.data?.data ?? []).length;
    }
    console.log('30 天全量评论数:', all);
  }
})();
