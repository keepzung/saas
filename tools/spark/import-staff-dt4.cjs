// 员工数据 Excel → ProKosStaff dt4 + ProKosOverview dt4 导入器
// 用法: node import-staff-dt4.cjs /opt/saas/logs/staff-dt4.jsonl /opt/saas/logs/overview-dt4.jsonl
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const BRAND_ID = 6;
const DATE_TYPE = 4;
const stat = (day) => new Date(`${day}T00:00:00.000+08:00`);
const NUMF = ['createNoteNum', 'rtbNoteNum', 'socEnageCnt', 'leadsSuccess', 'messageOpenCnt', 'messageDrivingOpenCnt', 'msgLeadsNum', 'socImpCnt', 'socClickCnt'];
const F = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

(async () => {
  const [staffFile, ovFile] = process.argv.slice(2);
  if (!staffFile || !fs.existsSync(staffFile)) { console.error('用法: node import-staff-dt4.cjs <staff.jsonl> [overview.jsonl]'); process.exit(1); }
  const prisma = new PrismaClient();

  const staffLines = fs.readFileSync(staffFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const uids = new Set();
  const byKey = new Map();
  for (const line of staffLines) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (!r.day || !r.userId) continue;
    uids.add(r.userId);
    byKey.set(`${r.day}|${r.userId}`, r);
  }
  const kos = await prisma.kosAccount.findMany({ where: { brandId: BRAND_ID }, select: { authorId: true, nickname: true } });
  const authorSet = new Set(kos.filter((k) => k.authorId).map((k) => k.authorId));
  const matchedUids = [...uids].filter((u) => authorSet.has(u));
  console.log(`staff 行=${byKey.size}, 唯一UID=${uids.size}, 匹配基线 authorId=${matchedUids.length}, 未匹配=${uids.size - matchedUids.length}`);

  let done = 0;
  for (const [key, r] of byKey) {
    const statDate = stat(r.day);
    const data = {
      nickName: (r.nickName || '').slice(0, 50),
      createNoteNum: F(r.createNoteNum), rtbNoteNum: F(r.rtbNoteNum), rtbIncomeAmt: F(r.rtbIncomeAmt),
      socEnageCnt: F(r.socEnageCnt), leadsSuccess: F(r.leadsSuccess),
      messageOpenCnt: F(r.messageOpenCnt), messageDrivingOpenCnt: F(r.messageDrivingOpenCnt), msgLeadsNum: F(r.msgLeadsNum),
      socImpCnt: F(r.socImpCnt), socClickCnt: F(r.socClickCnt),
    };
    await prisma.proKosStaff.upsert({
      where: { brandId_userId_statDate_dateType: { brandId: BRAND_ID, userId: r.userId, statDate, dateType: DATE_TYPE } },
      update: data, create: { brandId: BRAND_ID, userId: r.userId, statDate, dateType: DATE_TYPE, ...data },
    });
    done += 1;
    if (done % 4000 === 0) console.log(`staff upsert ${done}/${byKey.size}`);
  }
  console.log(`=== staff 完成: ${done} 行`);

  if (ovFile && fs.existsSync(ovFile)) {
    let ov = 0;
    for (const line of fs.readFileSync(ovFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (!r.day) continue;
      const statDate = stat(r.day);
      const exist = await prisma.proKosOverview.findFirst({ where: { brandId: BRAND_ID, statDate, dateType: DATE_TYPE } });
      if (exist) {
        await prisma.proKosOverview.update({ where: { id: exist.id }, data: { createNoteNum: F(r.createNoteNum), kosAccountNum: F(r.kosAccountNum) } });
      } else {
        await prisma.proKosOverview.create({ data: { brandId: BRAND_ID, statDate, dateType: DATE_TYPE, startDate: statDate, endDate: new Date(statDate.getTime() + 86399000), createNoteNum: F(r.createNoteNum), kosAccountNum: F(r.kosAccountNum) } });
      }
      ov += 1;
    }
    console.log(`=== overview 完成: ${ov} 天`);
  }
  await prisma.sparkSyncLog.create({ data: { brandId: BRAND_ID, syncType: 'staff_dt4_excel_import', statDate: '2026-01-01~2026-09-30', status: 'success', fetched: done, upserted: done, message: `员工数据 excel 导入 staff=${done} overview=${ovFile ? ov || 0 : 0}` } });
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
