// 一次性探针：服务器侧裸 fetch 调获客工具统计 API，观察响应流行为（是否无限流/巨量体）
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const { PrismaClient } = backendRequire('@prisma/client');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API = 'https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list';
const day = process.argv[2] || '2026-11-02';
(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: 6 } });
  await prisma.$disconnect();
  const cookieStr = JSON.parse(cfg.storageState).cookies
    .filter((c) => /xiaohongshu\.com$/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`).join('; ');
  const t0 = Date.now();
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStr, Referer: 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management', Origin: 'https://pro.xiaohongshu.com', 'User-Agent': UA },
    body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId: '', pageNum: 1, pageSize: 10 }),
  });
  console.log('status=', res.status, 'ct=', res.headers.get('content-type'), 'cl=', res.headers.get('content-length'), 't=', Date.now() - t0, 'ms');
  let total = 0, chunks = 0, head = '';
  for await (const chunk of res.body) {
    total += chunk.length; chunks += 1;
    if (head.length < 400) head += chunk.toString('utf8');
    if (chunks % 200 === 0) console.log(`chunk#=${chunks} total=${total}B t=${Date.now() - t0}ms`);
    if (total > 5e6) { console.log('超过 5MB 终止读取; head=', head.slice(0, 300)); process.exit(3); }
  }
  console.log(`完成: chunks=${chunks} total=${total}B t=${Date.now() - t0}ms`);
  console.log('head=', head.slice(0, 300));
  process.exit(0);
})();
