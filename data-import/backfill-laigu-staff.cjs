// 来鼓私信归属员工回填：LaiguLead.staffName ← rawJson.messages 中第一条非 client 消息的发送者名
// 用法: node backfill-laigu-staff.cjs [--dry]   （在 backend/.env 配置 DATABASE_URL 后于 backend 目录运行，
//       或与 data-import 其他脚本一致直接 node 运行，读取环境变量 DATABASE_URL）
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

(async () => {
  const rows = await prisma.laiguLead.findMany({
    where: { staffName: null },
    select: { id: true, rawJson: true },
    orderBy: { id: 'asc' },
  });
  console.log(`待回填 ${rows.length} 条`);
  let updated = 0;
  let miss = 0;
  for (const r of rows) {
    const raw = r.rawJson;
    const messages = Array.isArray(raw?.messages) ? raw.messages : [];
    let staffName = null;
    for (const m of messages) {
      if (!m || m.role === 'client') continue;
      const name = typeof m.name === 'string' ? m.name.trim() : '';
      if (name) {
        staffName = name.slice(0, 60);
        break;
      }
    }
    if (!staffName) {
      miss += 1;
      continue;
    }
    if (!dry) {
      await prisma.laiguLead.update({ where: { id: r.id }, data: { staffName } });
    }
    updated += 1;
    if (updated % 500 === 0) console.log(`  已处理 ${updated}`);
  }
  console.log(`完成：回填 ${updated}，无客服名 ${miss}${dry ? '（dry-run 未写库）' : ''}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
