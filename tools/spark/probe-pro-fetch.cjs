// 专业号平台纯 fetch 重放验证：overview / staff/list / butterfly — 探参数与分页
// 用法: TAG=tesla2 node probe-pro-fetch.cjs
const fs = require('fs');
const path = require('path');
const TAG = (process.env.TAG || 'tesla2').trim();
const state = JSON.parse(fs.readFileSync(path.join(__dirname, `state/auth-${TAG}.json`), 'utf8'));
// 全域 cookie 拼接（.xiaohongshu.com 通配 + pro 域）
const COOKIE = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const BASE = 'https://pro.xiaohongshu.com';
const H = {
  Cookie: COOKIE,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  Origin: BASE,
  Referer: `${BASE}/enterprise/data/get-customer`,
};

const call = async (p, body) => {
  const res = await fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body ?? {}) });
  return res.json().catch(() => ({ nonJson: res.status }));
};

(async () => {
  // 1) overview 空参
  let r = await call('/api/edith/ads/pro/kos/data/overview', {});
  console.log('[overview {}]', JSON.stringify(r).slice(0, 300));

  // 2) overview 带时间
  r = await call('/api/edith/ads/pro/kos/data/overview', { startDate: '2026-09-22', endDate: '2026-09-28' });
  console.log('[overview dates]', JSON.stringify(r).slice(0, 300));

  // 3) staff/list 空参
  r = await call('/api/edith/ads/pro/kos/data/staff/list', {});
  const cnt = r?.data?.dtos?.length ?? 0;
  console.log(`[staff {}] code=${r?.code} rows=${cnt} total=${r?.data?.total ?? '?'} keys=${JSON.stringify(Object.keys(r?.data ?? {}))}`);

  // 4) staff/list 分页参数猜测
  for (const body of [{ page: 1, pageSize: 100 }, { pageIndex: 1, pageSize: 100 }, { pageNum: 1, pageSize: 100 }, { pageNo: 1, pageSize: 100 }]) {
    r = await call('/api/edith/ads/pro/kos/data/staff/list', body);
    const c2 = r?.data?.dtos?.length ?? 0;
    console.log(`[staff ${JSON.stringify(body)}] rows=${c2} total=${r?.data?.total ?? r?.data?.totalCount ?? '?'}`);
    if (c2 > 100) break;
  }
})();
