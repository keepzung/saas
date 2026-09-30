// 导出本地 pro 快照（Overview + Staff 最新 statDate 全档）→ JSON，供推送生产
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const R = createRequire(path.resolve(__dirname, '..', 'backend', 'noop.js'));
const { PrismaClient } = R('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const ovLatest = await prisma.proKosOverview.findFirst({ where: { brandId: 6 }, orderBy: { statDate: 'desc' }, select: { statDate: true } });
  if (!ovLatest) { console.error('本地无 pro 快照'); process.exit(1); }
  const statDate = ovLatest.statDate;
  const overview = await prisma.proKosOverview.findMany({ where: { brandId: 6, statDate }, select: { dateType: true, startDate: true, endDate: true, kosAccountNum: true, rtbAccountNum: true, createNoteNum: true, rtbNoteNum: true, socReadCnt: true, adsReadCnt: true, messageOpenCnt: true, messageDrivingOpenCnt: true, msgLeadsNum: true, leadsSuccess: true, rtbIncomeAmt: true } });
  const staff = await prisma.proKosStaff.findMany({ where: { brandId: 6, statDate }, select: { dateType: true, userId: true, nickName: true, realName: true, avatar: true, province: true, city: true, createNoteNum: true, rtbNoteNum: true, socImpCnt: true, socClickCnt: true, socEnageCnt: true, messageOpenCnt: true, messageDrivingOpenCnt: true, msgLeadsNum: true, leadsSuccess: true, rtbIncomeAmt: true, interestsStatus: true, bindTime: true } });
  const out = { exportedAt: new Date().toISOString(), statDate: statDate.toISOString(), overview, staff };
  const file = path.join(__dirname, 'pro-snapshot-push.json');
  fs.writeFileSync(file, JSON.stringify(out), 'utf8');
  console.log(`导出 statDate=${statDate.toISOString()} overview=${overview.length} staff=${staff.length} → ${file}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
