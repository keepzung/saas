// 生产导入：pro-snapshot-push.json upsert 到生产库（ProKosOverview/ProKosStaff）
// 用法: node import-pro-snapshot.cjs pro-snapshot-push.json
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('用法: node import-pro-snapshot.cjs <json>'); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const brandId = 6;
  const statDate = new Date(j.statDate);
  let ovUp = 0;
  for (const o of j.overview) {
    const data = {
      startDate: o.startDate, endDate: o.endDate,
      kosAccountNum: o.kosAccountNum, rtbAccountNum: o.rtbAccountNum,
      createNoteNum: o.createNoteNum, rtbNoteNum: o.rtbNoteNum,
      socReadCnt: o.socReadCnt, adsReadCnt: o.adsReadCnt,
      messageOpenCnt: o.messageOpenCnt, messageDrivingOpenCnt: o.messageDrivingOpenCnt,
      msgLeadsNum: o.msgLeadsNum, leadsSuccess: o.leadsSuccess, rtbIncomeAmt: o.rtbIncomeAmt,
    };
    await prisma.proKosOverview.upsert({
      where: { brandId_statDate_dateType: { brandId, statDate, dateType: o.dateType } },
      update: data,
      create: { brandId, statDate, dateType: o.dateType, ...data },
    });
    ovUp += 1;
  }
  let stUp = 0;
  for (const s of j.staff) {
    const data = {
      nickName: s.nickName, realName: s.realName, avatar: s.avatar,
      province: s.province, city: s.city, area: s.area,
      createNoteNum: s.createNoteNum, rtbNoteNum: s.rtbNoteNum,
      socImpCnt: s.socImpCnt, socClickCnt: s.socClickCnt, socEnageCnt: s.socEnageCnt,
      messageOpenCnt: s.messageOpenCnt, messageDrivingOpenCnt: s.messageDrivingOpenCnt,
      msgLeadsNum: s.msgLeadsNum, leadsSuccess: s.leadsSuccess, rtbIncomeAmt: s.rtbIncomeAmt,
      interestsStatus: s.interestsStatus, bindTime: s.bindTime,
    };
    await prisma.proKosStaff.upsert({
      where: { brandId_userId_statDate_dateType: { brandId, userId: s.userId, statDate, dateType: s.dateType ?? 0 } },
      update: data,
      create: { brandId, statDate, dateType: s.dateType ?? 0, userId: s.userId, ...data },
    });
    stUp += 1;
  }
  await prisma.proOrgConfig.update({ where: { brandId }, data: { lastSyncAt: new Date() } }).catch(() => {});
  console.log(`生产导入完成: statDate=${j.statDate} overview=${ovUp} staff=${stUp}（lastSyncAt 已更新，生产本轮跳过自同步）`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
