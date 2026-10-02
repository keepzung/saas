// 把导出的 KoxNote JSONL 导入生产库（authorUserId → 生产 KosAccount.authorId 映射回 accountId）
// 用法: node import-koxnote-brand6.cjs <JSONL 文件>
const { createRequire } = require('module');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const fs = require('fs');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('用法: node import-koxnote-brand6.cjs <JSONL>'); process.exit(1); }
  const p = new PrismaClient();
  const accts = await p.kosAccount.findMany({ where: { brandId: 6 }, select: { id: true, authorId: true } });
  const authorToId = new Map(accts.filter((a) => a.authorId).map((a) => [a.authorId, a.id]));
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  console.log(`rows: ${lines.length}, prod accounts: ${accts.length}`);
  const ops = [];
  let n = 0;
  for (const line of lines) {
    const r = JSON.parse(line);
    const data = {
      noteId: r.noteId,
      brandId: 6,
      title: r.title || '(聚光笔记)',
      noteType: r.noteType || 'normal',
      accountType: r.accountType || null,
      accountId: r.authorUserId ? authorToId.get(r.authorUserId) ?? null : null,
      authorName: r.authorName || null,
      publishTime: r.publishTime ? new Date(r.publishTime) : null,
      exposure: r.exposure ?? 0,
      views: r.views ?? 0,
      likes: r.likes ?? 0,
      collects: r.collects ?? 0,
      comments: r.comments ?? 0,
      shares: r.shares ?? 0,
      followCount: r.followCount ?? 0,
      pmInquiries: r.pmInquiries ?? 0,
      pmOpenings: r.pmOpenings ?? 0,
      pmLeads: r.pmLeads ?? 0,
      formLeads: r.formLeads ?? 0,
      authorName_fallback: undefined,
      isRtbAdver: r.isRtbAdver ?? null,
      noteUrl: r.noteUrl || null,
      coverUrl: r.coverUrl || null,
      statDate: r.statDate ? new Date(r.statDate) : null,
    };
    ops.push(p.koxNote.upsert({ where: { noteId: r.noteId }, update: data, create: data }));
    n += 1;
    if (ops.length >= 200) {
      await p.$transaction(ops.splice(0, ops.length), { timeout: 120000 });
      process.stdout.write(`  ${n} done\n`);
    }
  }
  if (ops.length) await p.$transaction(ops, { timeout: 120000 });
  console.log(`imported ${n} rows`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
