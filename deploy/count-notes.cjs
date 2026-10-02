// 生产笔记同步进度轮询脚本（在服务器 /opt/saas/backend 下以 deploy 用户运行）
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const n = await p.koxNote.count();
  const logs = await p.$queryRawUnsafe(
    'SELECT sync_type, stat_date, status, fetched, upserted, message, created_at FROM "SparkSyncLog" ORDER BY created_at DESC LIMIT 3',
  );
  console.log('KoxNote count:', n);
  logs.forEach((l) =>
    console.log(
      l.sync_type,
      l.stat_date,
      l.status,
      'fetched=' + l.fetched,
      'upserted=' + l.upserted,
      l.message || '',
      new Date(l.created_at).toISOString(),
    ),
  );
  await p.$disconnect();
})().catch((e) => console.error('ERR:', e.message));
