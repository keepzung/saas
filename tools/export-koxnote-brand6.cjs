// 把本地 brand6 的 KoxNote 全量导出为 JSONL（accountId 换算成稳定的 authorId）
// 用法: node export-koxnote-brand6.cjs <输出文件>
const { createRequire } = require('module');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const fs = require('fs');

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('用法: node export-koxnote-brand6.cjs <输出文件>'); process.exit(1); }
  const p = new PrismaClient();
  const accts = await p.kosAccount.findMany({ where: { brandId: 6 }, select: { id: true, authorId: true } });
  const acctToAuthor = new Map(accts.map((a) => [a.id, a.authorId]));
  const notes = await p.koxNote.findMany({
    where: { brandId: 6 },
    select: {
      noteId: true, accountId: true, title: true, coverUrl: true, noteUrl: true,
      noteType: true, publishTime: true, exposure: true, views: true, likes: true,
      collects: true, comments: true, shares: true, followCount: true,
      pmInquiries: true, pmOpenings: true, pmLeads: true, formLeads: true,
      authorName: true, accountType: true, isRtbAdver: true, statDate: true,
    },
  });
  const lines = notes.map((n) => JSON.stringify({
    ...n,
    authorUserId: n.accountId != null ? acctToAuthor.get(n.accountId) ?? null : null,
    accountId: undefined,
  }));
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`exported ${lines.length} rows -> ${out}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
