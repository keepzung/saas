#!/usr/bin/env node
// 修复账号重基重复：对照表 uid 与旧 authorId（tesla_xxx 哈希）体系不一致
// 处理：有旧账号（disabled、同昵称、有数据）→ 删除新建空行，旧账号换 uid 并 enabled；无旧账号 → 保留新行
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const file = process.argv[2] || path.join(__dirname, 'tesla-rebase-192.json');
const { accounts } = JSON.parse(fs.readFileSync(file, 'utf8'));
const prisma = new PrismaClient();
(async () => {
  let merged = 0, keptNew = 0, deletedNew = 0;
  for (const a of accounts) {
    const newRow = await prisma.kosAccount.findFirst({
      where: { brandId: 6, authorId: a.authorId, status: 'enabled' },
      select: { id: true, fans: true },
    });
    if (!newRow) continue; // 已合并或本来就在旧库
    const olds = await prisma.kosAccount.findMany({
      where: { brandId: 6, nickname: a.nickname, status: 'disabled', authorId: { not: a.authorId } },
      orderBy: [{ fans: 'desc' }],
      select: { id: true, authorId: true, fans: true },
    });
    if (olds.length) {
      const old = olds[0];
      await prisma.koxNote.updateMany({ where: { accountId: newRow.id }, data: { accountId: old.id } });
      await prisma.kosAccount.delete({ where: { id: newRow.id } }).catch(async () => {
        // 有外键引用时降级为禁用
        await prisma.kosAccount.update({ where: { id: newRow.id }, data: { status: 'disabled' } });
      });
      deletedNew += 1;
      await prisma.kosAccount.update({
        where: { id: old.id },
        data: {
          authorId: a.authorId,
          regionName: a.regionName,
          storeName: a.storeName,
          areaName: a.areaName,
          operatorName: a.operatorName,
          authorUrl: a.authorUrl,
          status: 'enabled',
        },
      });
      merged += 1;
    } else {
      // 真正的新账号：补门店/区域信息
      await prisma.kosAccount.update({
        where: { id: newRow.id },
        data: { regionName: a.regionName, storeName: a.storeName, areaName: a.areaName, operatorName: a.operatorName },
      });
      keptNew += 1;
    }
  }
  const cnt = await prisma.kosAccount.count({ where: { brandId: 6, status: 'enabled' } });
  const fans = await prisma.kosAccount.aggregate({ where: { brandId: 6, status: 'enabled' }, _sum: { fans: true } });
  console.log(`合并 ${merged}（删空行 ${deletedNew}），保留新账号 ${keptNew}，enabled=${cnt}，粉丝合计=${fans._sum.fans ?? 0}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
