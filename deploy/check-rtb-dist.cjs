// 检查 is_rtb_adver 值分布（在 targetList 嵌套内）
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.koxNote.findMany({ select: { rawJson: true } });
  const dist = {};
  let sampleShown = 0;
  for (const r of rows) {
    const list = (r.rawJson && r.rawJson.targetList) || [];
    const hit = list.find((t) => t.targetCode === 'is_rtb_adver');
    const v = hit ? String(hit.targetValue ?? '(empty)') : '(absent)';
    dist[v] = (dist[v] || 0) + 1;
    if (v === '1' && sampleShown < 2) {
      sampleShown += 1;
      const title = (list.find((t) => t.targetCode === 'note_title') || {}).targetValue;
      console.log('已推广示例:', title);
    }
  }
  console.log('is_rtb_adver 分布:', JSON.stringify(dist));
  await p.$disconnect();
})().catch((e) => console.error('ERR:', e.message));
