#!/usr/bin/env node
// 封面镜像器：把 KoxNote 的外链封面（ci.xiaohongshu.com 等）下载到本地 uploads/covers/，
// 成功后把 cover_url 改写为 /uploads/covers/<noteId>.jpg（彻底摆脱小红书 CDN 防盗链/失效问题）
// 用法:
//   node mirror-covers.cjs --since 2026-09-01 [--limit 2000] [--brandId 6]
//   node mirror-covers.cjs --noteids id1,id2   （补指定笔记）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const COVER_DIR = path.join(ROOT, 'backend', 'uploads', 'covers');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const SINCE = argOf('--since', null);
const LIMIT = Number(argOf('--limit', 3000));
const IDS = (argv.includes('--noteids') ? argOf('--noteids', '') : '').split(',').filter(Boolean);

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
  const where = { brandId: 6, coverUrl: { startsWith: 'http' } };
  if (IDS.length) where.noteId = { in: IDS };
  else if (SINCE) where.publishTime = { gte: new Date(`${SINCE}T00:00:00+08:00`) };
  const rows = await p.koxNote.findMany({ where, select: { id: true, noteId: true, coverUrl: true }, orderBy: { publishTime: 'desc' }, take: LIMIT });
  console.log(`待镜像封面: ${rows.length}`);
  let ok = 0, skip = 0, fail = 0;
  const ops = [];
  for (const r of rows) {
    const local = path.join(COVER_DIR, `${r.noteId}.jpg`);
    if (fs.existsSync(local)) { skip += 1; continue; }
    try {
      const size = await download(r.coverUrl, local);
      if (size < 1000) throw new Error('empty');
      ops.push(p.koxNote.update({ where: { id: r.id }, data: { coverUrl: `/uploads/covers/${r.noteId}.jpg` } }));
      ok += 1;
    } catch (e) {
      fail += 1;
      if (fail % 50 === 1) console.log(`  失败样例 ${r.noteId}: ${String(e).slice(0, 60)}`);
    }
    if (ops.length >= 200) { await p.$transaction(ops.splice(0, ops.length), { timeout: 120000 }); process.stdout.write(`  进度 ${ok + skip + fail}\n`); }
  }
  if (ops.length) await p.$transaction(ops, { timeout: 180000 });
  console.log(`完成: 成功镜像 ${ok}，已存在跳过 ${skip}，失败 ${fail}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
