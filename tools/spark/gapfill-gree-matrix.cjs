#!/usr/bin/env node
// 格力员工矩阵 9-01~11-03 全员工×全日补洞: 已由 import-gree-ad-matrix-backfill.cjs 写入
// 有投放活动的员工×日; 此步补齐其余员工×日分区(createNoteNum 取库里平台笔记数, 其余 0),
// 使日期区间查询员工覆盖完整、与平台 11-04+ 的行为一致。幂等(仅 create, 不改已有行)。
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/noop.js');
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();
const BRAND = 8;
(async () => {
  const tmplRows = await prisma.sparkStaffUserDaily.findMany({
    where: { brandId: BRAND, statDate: { gte: new Date('2026-11-01T00:00:00.000Z') } },
    orderBy: { statDate: 'desc' },
  });
  const tmpl = new Map(); // userId -> 身份模板
  for (const t of tmplRows) if (!tmpl.has(t.userId)) tmpl.set(t.userId, t);
  console.log('员工模板数=', tmpl.size);
  const nds = await prisma.koxNoteDailyStat.groupBy({
    by: ['accountId', 'day'],
    where: { brandId: BRAND, accountId: { not: null }, day: { gte: new Date('2026-09-01T00:00:00.000Z'), lt: new Date('2026-11-04T00:00:00.000Z') } },
    _count: { _all: true },
  });
  const noteCnt = new Map();
  for (const g of nds) noteCnt.set(`${g.accountId}|${g.day.toISOString().slice(0,10)}`, g._count._all);
  const acctByAcctId = new Map();
  for (const a of await prisma.kosAccount.findMany({ where: { brandId: BRAND }, select: { id: true, nickname: true } }))
    acctByAcctId.set(a.id, a);
  let created = 0, skipped = 0;
  for (let d = new Date('2026-09-01T00:00:00.000Z'); d < new Date('2026-11-04T00:00:00.000Z'); d = new Date(d.getTime() + 86400000)) {
    const dayISO = d.toISOString().slice(0, 10);
    for (const [userId, t] of tmpl) {
      const exists = await prisma.sparkStaffUserDaily.findFirst({ where: { brandId: BRAND, userId, statDate: d } });
      if (exists) { skipped += 1; continue; }
      const nick = (t.nickname || '').trim();
      let cNote = 0;
      for (const [acctId, a] of acctByAcctId) {
        if ((a.nickname || '').trim() === nick) { cNote = noteCnt.get(`${acctId}|${dayISO}`) || 0; if (cNote) break; }
      }
      await prisma.sparkStaffUserDaily.create({ data: {
        statDate: d, userId, brandId: BRAND,
        brandUserId: t.brandUserId || '', brandUserName: t.brandUserName || null,
        staffName: t.staffName || null, nickname: t.nickname || null,
        accountType: t.accountType || null, bindDate: t.bindDate || null,
        staffArea: t.staffArea || null, staffLabel: t.staffLabel || null,
        createNoteNum: cNote,
        rawJson: { source: 'gapfill_20261120', caliber: '仅createNoteNum=平台笔记数, 其余字段无历史来源留0' },
      } });
      created += 1;
    }
  }
  console.log(`补洞完成: 新建 ${created} 行, 跳过已存在 ${skipped} 行`);
})().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().catch(() => {}));
