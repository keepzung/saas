// /aigc/* 深入探测（saas.marketine.cn/api Laravel 后端）
const fs = require('fs');
const path = require('path');
const TOKEN = fs.readFileSync(path.join(__dirname, '.tokens', 'token-867.txt'), 'utf8').trim();
const BASE = 'https://saas.marketine.cn/api';

const get = async (p, q, extraHeaders = {}) => {
  const qs = q ? '?' + new URLSearchParams(q) : '';
  const res = await fetch(`${BASE}${p}${qs}`, { headers: { token: TOKEN, 'X-Brand-Id': '14', ...extraHeaders } });
  const text = await res.text();
  try { return { status: res.status, j: JSON.parse(text) }; } catch { return { status: res.status, raw: text.slice(0, 300) }; }
};

(async () => {
  const attempts = [
    ['/aigc/materiallistnew', { page: 1, page_size: 3, brand_id: 14 }],
    ['/aigc/materiallistnew', { page: 1, page_size: 3 }],
    ['/aigc/materiallistnew', { page: 1, pageSize: 3, main_company_id: 867 }],
    ['/aigc/materiallist', { page: 1, pageSize: 3, brand_id: 14 }],
    ['/aigc/materialrandomimages', { product_id: 78, num: 3 }],
    ['/aigc/materialrandomimages', { product_id: 78 }],
    ['/aigc/xiaohongshu-all/xhs-history', { page: 1, page_size: 2 }],
    ['/aigc/articles', { page: 1, page_size: 2 }],
  ];
  for (const [p, q] of attempts) {
    const r = await get(p, q).catch((e) => ({ err: e.message }));
    const brief = r.j ? JSON.stringify(r.j).slice(0, 700) : (r.raw || JSON.stringify(r));
    console.log(`\n### ${p} ${JSON.stringify(q)} [${r.status}]\n${brief}`);
  }
})();
