// 一次性限流探测: code=0=解除, 其他=仍在冷却
const fs = require('fs');
const cookie = fs.readFileSync('/opt/saas/logs/bts-cookie.txt', 'utf8').trim();
const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
fetch('https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, Referer: 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management', Origin: 'https://pro.xiaohongshu.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
  body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId: '', pageNum: 1, pageSize: 1 }),
}).then(async (r) => {
  const j = await r.json().catch(() => null);
  console.log('code=' + (j ? j.code : 'null'));
  process.exit(0);
}).catch(() => { console.log('code=network'); process.exit(0); });
