#!/usr/bin/env node
// 封面回填到生产：读本地导出的 tesla-covers.csv（noteId,coverUrl,title），按 noteId 更新生产库
// 用法: node apply-covers-prod.cjs tesla-covers.csv
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const backendRequire = createRequire(path.resolve(__dirname, '..', 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const csvFile = process.argv[2];
if (!csvFile || !fs.existsSync(csvFile)) {
  console.error('用法: node apply-covers-prod.cjs <tesla-covers.csv>');
  process.exit(1);
}
const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

(async () => {
  const text = fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const prisma = new PrismaClient();
  let coverOk = 0;
  let titleOk = 0;
  let skip = 0;
  for (const line of lines.slice(1)) {
    const [noteId, coverUrl, title] = parseCsvLine(line);
    if (!noteId) continue;
    const row = await prisma.koxNote.findUnique({ where: { noteId }, select: { id: true, coverUrl: true, title: true } });
    if (!row) { skip += 1; continue; }
    const data = {};
    if (coverUrl && !row.coverUrl) data.coverUrl = coverUrl;
    if (title && title !== '(乐允投放笔记)' && (!row.title || row.title === '(乐允投放笔记)')) data.title = title;
    if (!Object.keys(data).length) { skip += 1; continue; }
    await prisma.koxNote.update({ where: { id: row.id }, data });
    if (data.coverUrl) coverOk += 1;
    if (data.title) titleOk += 1;
  }
  console.log(`[prod-covers] 封面回填 ${coverOk}，标题回填 ${titleOk}，跳过 ${skip}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
