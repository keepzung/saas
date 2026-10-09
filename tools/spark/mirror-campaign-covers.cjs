// 定向封面镜像：只处理「按笔记汇总」tab 的投流笔记（KoxJuguangNoteDaily 涉及的 noteId），
// 把外链封面下载到 backend/uploads/covers/ 并改写 coverUrl → /uploads/covers/<noteId>.jpg
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const ROOT = '/opt/saas';
const COVER_DIR = path.join(ROOT, 'backend', 'uploads', 'covers');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`too small ${buf.length}B`);
  fs.writeFileSync(file, buf);
  return buf.length;
}

(async () => {
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const cIds = await p.koxJuguangNoteDaily.findMany({ where: { brandId: 6 }, select: { noteId: true }, distinct: ['noteId'] });
  const idSet = [...new Set(cIds.map((x) => x.noteId))];
  console.log(`投流笔记 ${idSet.length} 篇，检查外链封面...`);
  let targets = [];
  for (let i = 0; i < idSet.length; i += 500) {
    const chunk = idSet.slice(i, i + 500);
    const rows = await p.koxNote.findMany({
      where: { brandId: 6, coverUrl: { startsWith: 'http' }, noteId: { in: chunk } },
      select: { id: true, noteId: true, coverUrl: true },
    });
    targets = targets.concat(rows);
  }
  console.log(`待镜像: ${targets.length}`);
  let ok = 0, skip = 0, fail = 0;
  let ops = [];
  for (const r of targets) {
    const local = path.join(COVER_DIR, `${r.noteId}.jpg`);
    if (fs.existsSync(local)) {
      ops.push(p.koxNote.update({ where: { id: r.id }, data: { coverUrl: `/uploads/covers/${r.noteId}.jpg` } }));
      skip += 1;
    } else {
      try {
        await download(r.coverUrl, local);
        ops.push(p.koxNote.update({ where: { id: r.id }, data: { coverUrl: `/uploads/covers/${r.noteId}.jpg` } }));
        ok += 1;
      } catch (e) {
        fail += 1;
        if (fail % 50 === 1) console.log(`  fail ${r.noteId}: ${String(e).slice(0, 60)}`);
      }
    }
    if (ops.length >= 200) { await p.$transaction(ops.splice(0, ops.length), { timeout: 120000 }); console.log(`  progress ${ok + skip + fail}/${targets.length}`); }
  }
  if (ops.length) await p.$transaction(ops, { timeout: 180000 });
  console.log(`DONE: mirrored ${ok}, reused ${skip}, failed ${fail}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
