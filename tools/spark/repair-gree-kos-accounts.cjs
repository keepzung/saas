#!/usr/bin/env node
// 格力底表账号修复(2026-11-20, 用户指出应为30个账号):
// 1) 7个 gr_<md5> 占位 authorId 回填规划表真实UID(同东风占位回填模式)
// 2) 新增缺失2账号(刘华松-雷哥/刘维秀-二郎红星美凯龙)
// 3) NDS+KoxNote 归属补全: accountId 为空且 authorName=底表昵称 的行回填 accountId
// 幂等可重跑。规划表30账号 vs 修复后底表31(多1个上海刘姐, 不在11月规划表, 保留不动)。
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/noop.js');
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
const BRAND = 8;
const fixes = [
  { nickname: '郴州瑞恒格力', authorId: '69c3460a0000000032019dc5', name: '何淑群' },
  { nickname: '宝山牡丹江路店格力空调小陈', authorId: '691ec7b1000000003700a68d', name: '陈娜' },
  { nickname: '常德格力空调小占哥', authorId: '699425f0000000002100699d', name: '占易坤' },
  { nickname: '湖南格力小胡', authorId: '6a8806bb000000001400c801', name: '胡睿含' },
  { nickname: '衡阳格力中央空调小李', authorId: '69dc9f88000000003202a43f', name: '李昌竑' },
  { nickname: '格力中央空调 陈大碗（韶关）', authorId: '616ff331000000000201b783', name: '陈培碗' },
  { nickname: '格力李家沱正街店', authorId: '6a82c0f10000000013022405', name: '龙小凤' },
];
const inserts = [
  { nickname: '红星星艺佳格力中央空调雷哥', authorId: '68f71581000000003201b870', name: '刘华松', regionName: '上海市', areaName: '上海市', storeName: '上海格力中央空调（松江店）' },
  { nickname: '重庆格力（二朗红星美凯龙）', authorId: '62adee59000000001b02a291', name: '刘维秀', regionName: '重庆市', areaName: '重庆', storeName: '格力中央空调二郎红星美凯龙店' },
];
(async () => {
  for (const f of fixes) {
    const acc = await prisma.kosAccount.findFirst({ where: { brandId: BRAND, nickname: f.nickname } });
    if (!acc) { console.log('未找到(跳过):', f.nickname); continue; }
    if (!acc.authorId.startsWith('gr_')) { console.log('已修复过(跳过):', f.nickname, acc.authorId); continue; }
    const dup = await prisma.kosAccount.findUnique({ where: { authorId: f.authorId } });
    if (dup) { console.log('目标UID已存在(跳过):', f.nickname, f.authorId); continue; }
    await prisma.kosAccount.update({ where: { id: acc.id }, data: { authorId: f.authorId } });
    console.log('UID回填:', f.nickname, acc.authorId, '→', f.authorId);
  }
  for (const i of inserts) {
    const dup = await prisma.kosAccount.findUnique({ where: { authorId: i.authorId } });
    if (dup) { console.log('账号已存在(跳过):', i.nickname); continue; }
    await prisma.kosAccount.create({ data: {
      brandId: BRAND, nickname: i.nickname, authorId: i.authorId, accountType: 'KOS',
      regionName: i.regionName, areaName: i.areaName, storeName: i.storeName,
      operatorName: i.name, status: 'enabled', source: 'repair_推进表_20261120',
    } });
    console.log('新增账号:', i.nickname, i.authorId, '(' + i.name + ')');
  }
  // 归属补全: NDS + KoxNote accountId 为空且 authorName=底表昵称
  const accs = await prisma.kosAccount.findMany({ where: { brandId: BRAND }, select: { id: true, nickname: true } });
  let ndsFilled = 0, noteFilled = 0;
  for (const a of accs) {
    if (!a.nickname) continue;
    const r1 = await prisma.koxNoteDailyStat.updateMany({ where: { brandId: BRAND, accountId: null, authorName: a.nickname }, data: { accountId: a.id } });
    ndsFilled += r1.count;
    const r2 = await prisma.koxNote.updateMany({ where: { brandId: BRAND, accountId: null, authorName: a.nickname }, data: { accountId: a.id } });
    noteFilled += r2.count;
  }
  console.log(`NDS归属回填 ${ndsFilled} 行, KoxNote归属回填 ${noteFilled} 行`);
  const [ndsAttr, noteAttr, kosCnt] = [await prisma.koxNoteDailyStat.count({ where: { brandId: BRAND, accountId: { not: null } } }),
    await prisma.koxNote.count({ where: { brandId: BRAND, accountId: { not: null } } }),
    await prisma.kosAccount.count({ where: { brandId: BRAND } })];
  console.log(`修复后: 底表=${kosCnt}, NDS归属监控账号行=${ndsAttr}, KoxNote归属监控账号=${noteAttr}`);
})().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
