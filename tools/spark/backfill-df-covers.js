#!/usr/bin/env node
// 东风笔记封面回填：从笔记页 og:image 抓取封面回填 coverUrl
// 用法: node backfill-df-covers.js --limit 20 [--all]
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const all = argv.includes('--all');
const limIdx = argv.indexOf('--limit');
const LIMIT = limIdx > -1 ? Number(argv[limIdx + 1]) : 20;
const DELAY = 1500;

async function main() {
  const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId: 7 }, select: { cookie: true } });
  if (!cfg?.cookie) { console.error('无 brand7 cookie'); process.exit(1); }
  const rows = await p.koxNote.findMany({
    where: { brandId: 7, noteUrl: { not: null, notIn: [''] }, OR: [{ coverUrl: null }, { coverUrl: '' }] },
    select: { id: true, noteUrl: true },
    orderBy: { id: 'desc' },
    take: all ? undefined : LIMIT,
  });
  console.log(`待回填: ${rows.length} 篇（模式: ${all ? '全量' : `试跑 ${LIMIT}`}）`);
  let ok = 0, miss = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const res = await fetch(r.noteUrl, {
        headers: { Cookie: cfg.cookie, 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      const html = await res.text();
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (m && /^https?:\/\//.test(m[1])) {
        await p.koxNote.update({ where: { id: r.id }, data: { coverUrl: m[1] } });
        ok++;
      } else {
        miss++;
      }
    } catch (e) {
      fail++;
    }
    if ((i + 1) % 10 === 0) console.log(`  进度 ${i + 1}/${rows.length} · 成功 ${ok} · 无图 ${miss} · 失败 ${fail}`);
    await new Promise((r2) => setTimeout(r2, DELAY + Math.floor(Math.random() * 500)));
  }
  console.log(`完成: 成功回填 ${ok} · 页面无图 ${miss} · 请求失败 ${fail}（共 ${rows.length}）`);
  await p.$disconnect();
}
main();
