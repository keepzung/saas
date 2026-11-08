#!/usr/bin/env node
// 服务器端：打印某品牌启用中的关键词（JSON 数组），供本机抓取脚本读取
// 用法: node list-keywords-server.cjs <brandId> [platform]
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const { PrismaClient } = backendRequire('@prisma/client');

(async () => {
  const brandId = Number(process.argv[2] ?? 6);
  const platform = process.argv[3] ?? 'xhs';
  const p = new PrismaClient();
  const rows = await p.hotspotKeyword.findMany({
    where: { brandId, enabled: true },
    orderBy: { id: 'asc' },
    select: { keyword: true, platforms: true },
  });
  await p.$disconnect();
  const list = rows.filter((r) => !r.platforms?.length || r.platforms.includes(platform)).map((r) => r.keyword);
  console.log(JSON.stringify(list));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
