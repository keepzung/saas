// 获客工具统计（ProClueToolStatDaily）Excel 导入器：读 JSONL（day/belongUserId/10 组件指标）批量 upsert
// 用法: node import-toolstat-excel.cjs /path/to/toolstat-all.jsonl
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const BRAND_ID = 6;
const F = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('用法: node import-toolstat-excel.cjs <jsonl>'); process.exit(1); }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const prisma = new PrismaClient();
  let n = 0, days = new Set();
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec.day || !rec.belongUserId) continue;
    const dayDate = new Date(`${rec.day}T00:00:00.000+08:00`);
    const data = {
      consultUserCnt: F(rec.consultUserCnt), msgChatUserCnt: F(rec.msgChatUserCnt), msgLeadsUserCnt: F(rec.msgLeadsUserCnt),
      serviceCardLeadsUserCnt: F(rec.serviceCardLeadsUserCnt), qwAddLeadsUserCnt: F(rec.qwAddLeadsUserCnt),
      bookCompLeadsUserCnt: F(rec.bookCompLeadsUserCnt), landingPageLeadsUserCnt: F(rec.landingPageLeadsUserCnt),
      wechatLeadsUserCnt: F(rec.wechatLeadsUserCnt), appCardLeadsUserCnt: F(rec.appCardLeadsUserCnt),
      otherLeadsUserCnt: F(rec.otherLeadsUserCnt),
    };
    await prisma.proClueToolStatDaily.upsert({
      where: { brandId_day_belongUserId: { brandId: BRAND_ID, day: dayDate, belongUserId: rec.belongUserId } },
      update: data, create: { brandId: BRAND_ID, day: dayDate, belongUserId: rec.belongUserId, ...data },
    });
    n += 1;
    days.add(rec.day);
    if (n % 2000 === 0) console.log(`已 upsert ${n}/${lines.length}`);
  }
  await prisma.sparkSyncLog.create({ data: { brandId: BRAND_ID, syncType: 'tool_stat_excel_import', statDate: `${[...days].sort()[0] ?? ''}~${[...days].sort().pop() ?? ''}`, status: 'success', fetched: n, upserted: n, message: `excel 导入 ${n} 行 / ${days.size} 天 (源=客户月度导出)` } });
  console.log(`=== 导入完成: ${n} 行, ${days.size} 天`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
