#!/usr/bin/env node
// 按账号基建sheet对齐格力底表: b870账号(基建=上海董明珠健康家刘姐/刘华松/松江店)此前被我
// 以'雷哥'昵称重复插入+原刘姐行留占位UID, 现合并: 删雷哥行, 刘姐行占位UID→真实UID, 字段按基建校正。
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/noop.js');
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
const REAL = '68f71581000000003201b870';
(async () => {
  const dup = await prisma.kosAccount.findUnique({ where: { authorId: REAL } });
  if (dup) {
    if (dup.nickname === '红星星艺佳格力中央空调雷哥') {
      await prisma.kosAccount.delete({ where: { id: dup.id } });
      console.log('已删除重复插入的雷哥行 id=', dup.id);
    } else { console.log('b870 已存在且昵称为', dup.nickname, '保留'); }
  }
  const lj = await prisma.kosAccount.findFirst({ where: { brandId: 8, nickname: '上海董明珠健康家刘姐' } });
  if (!lj) { console.log('未找到刘姐行!'); process.exit(1); }
  await prisma.kosAccount.update({ where: { id: lj.id }, data: {
    authorId: REAL, storeName: '上海格力中央空调（松江店）', operatorName: '刘华松',
  } });
  console.log('刘姐行 authorId', lj.authorId, '→', REAL);
  const accs = await prisma.kosAccount.findMany({ where: { brandId: 8 }, select: { authorId: true, nickname: true, status: true } });
  console.log('底表账号数=', accs.length, '占位残留=', accs.filter(a => a.authorId.startsWith('gr_')).length);
})().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
