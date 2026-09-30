#!/usr/bin/env node
// 小红书封面批量抓取 v2（brandId=6）：打作者主页 + 拦截 user_posted 响应拿封面
// 背景：explore 裸链被 300031 拦截（需 xsec_token）；作者主页列表自带 cover+token，一次导航覆盖整账号
// 数据源：tesla/特斯拉投放数据源.xlsx（作者ID→笔记 映射）
// 前置：node login-xhs-web.cjs 已扫码（state/xhs-web-tesla.json）
// 用法:
//   node fetch-xhs-covers-v2.cjs --authors 3     （试跑前 3 个作者）
//   node fetch-xhs-covers-v2.cjs                 （全部 218 个作者，断点续传：只处理还有缺封面笔记的作者）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(__dirname, 'package.json'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'noop.js'));
const { chromium } = sparkRequire('playwright');
const { PrismaClient } = backendRequire('@prisma/client');
const XLSX = frontendRequire('xlsx');

const BRAND_ID = 6;
const STATE = path.join(__dirname, 'state', 'xhs-web-tesla.json');
const XLSX_FILE = path.join(ROOT, 'tesla', '特斯拉投放数据源.xlsx');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const aIdx = argv.indexOf('--authors');
const AUTHOR_LIMIT = aIdx > -1 ? Number(argv[aIdx + 1]) || 0 : 0;
const MAX_SCROLLS = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GENERIC = 'fe-platform/';
const normalize = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = s.replace(/^http:\/\//, 'https://');
  if (s.includes(GENERIC)) return null;
  return s;
};

// xlsx：作者ID -> { nickname, noteIds:Set }
function loadAuthorMap() {
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  const map = new Map();
  for (const r of rows) {
    const authorId = String(r['作者ID'] ?? '').trim();
    const noteId = String(r['笔记ID'] ?? '').trim();
    const nickname = String(r['昵称'] ?? '').trim();
    if (!authorId || !noteId) continue;
    if (!map.has(authorId)) map.set(authorId, { nickname, noteIds: new Set() });
    map.get(authorId).noteIds.add(noteId);
  }
  return map;
}

(async () => {
  if (!fs.existsSync(STATE)) {
    console.error(`缺少登录态 ${STATE}，先跑 node login-xhs-web.cjs`);
    process.exit(1);
  }
  const authorMap = loadAuthorMap();
  const prisma = new PrismaClient();

  // 只处理仍有缺封面笔记的作者（断点续传）
  const needNoteIds = await prisma.koxNote.findMany({
    where: { brandId: BRAND_ID, coverUrl: null, noteId: { in: [...authorMap.values()].flatMap((a) => [...a.noteIds]) } },
    select: { noteId: true },
  });
  const needSet = new Set(needNoteIds.map((n) => n.noteId));
  const authors = [...authorMap.entries()]
    .map(([authorId, a]) => ({ authorId, nickname: a.nickname, notes: [...a.noteIds].filter((id) => needSet.has(id)) }))
    .filter((a) => a.notes.length > 0);
  console.log(`[v2] 待处理作者 ${authors.length} 个，覆盖缺封面笔记 ${needSet.size} 篇`);

  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  let okTotal = 0;
  let authorsDone = 0;
  const t0 = Date.now();

  for (const author of AUTHOR_LIMIT ? authors.slice(0, AUTHOR_LIMIT) : authors) {
    // 捕获 user_posted 响应
    const collected = new Map(); // noteId -> {cover, title}
    let seenResponses = 0;
    const onResponse = (res) => {
      if (!res.url().includes('/api/sns/web/v1/user_posted')) return;
      seenResponses += 1;
      res
        .json()
        .then((j) => {
          const notes = j?.data?.notes;
          if (!Array.isArray(notes)) return;
          for (const nt of notes) {
            const id = nt.note_id || nt.noteId;
            if (!id || collected.has(id)) continue;
            const cover =
              normalize(nt.cover?.url) ||
              normalize(nt.cover?.url_default) ||
              (Array.isArray(nt.cover?.info_list) ? normalize(nt.cover.info_list.at(-1)?.url) : null) ||
              (nt.noteCard ? null : null);
            collected.set(id, { cover, title: String(nt.display_title || '').slice(0, 120) });
          }
        })
        .catch(() => {});
    };
    page.on('response', onResponse);
    try {
      await page.goto(`https://www.xiaohongshu.com/user/profile/${author.authorId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await sleep(2500);
      // 滚动翻页直到无新增
      let idle = 0;
      for (let s = 0; s < MAX_SCROLLS; s++) {
        const before = collected.size;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1600);
        if (collected.size === before) {
          idle += 1;
          if (idle >= 2) break;
        } else {
          idle = 0;
        }
        if (collected.size >= author.notes.length) break; // 目标笔记已全覆盖
      }

      // 写库：该作者缺封面的笔记
      let ok = 0;
      let titles = 0;
      for (const noteId of author.notes) {
        const hit = collected.get(noteId);
        if (!hit) continue;
        const data = {};
        if (hit.cover) data.coverUrl = hit.cover;
        const row = await prisma.koxNote.findUnique({ where: { noteId }, select: { id: true, title: true } });
        if (row && (!row.title || row.title === '(乐允投放笔记)') && hit.title && hit.title !== '(乐允投放笔记)') {
          data.title = hit.title;
          titles += 1;
        }
        if (row && Object.keys(data).length) {
          await prisma.koxNote.update({ where: { id: row.id }, data });
          ok += 1;
        }
      }
      okTotal += ok;
      authorsDone += 1;
      if (authorsDone % 10 === 0 || ok === 0) {
        const etaMin = Math.round(((authors.length - authorsDone) * (Date.now() - t0)) / authorsDone / 60000);
        console.log(`[v2] ${author.nickname}: 列表抓到 ${collected.size} 条/目标 ${author.notes.length}，回填 ${ok}${ok === 0 ? ' ← 未命中' : ''} | 总进度 ${authorsDone}/${authors.length}，封面+${okTotal}，剩余约 ${etaMin} 分钟`);
      }
    } catch (e) {
      console.log(`[v2] ${author.nickname} 打开失败: ${String(e).slice(0, 80)}`);
    } finally {
      page.off('response', onResponse);
    }
    await sleep(900 + Math.floor(Math.random() * 600));
  }

  const [withCover, total] = await Promise.all([
    prisma.koxNote.count({ where: { brandId: BRAND_ID, coverUrl: { not: null } } }),
    prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
  ]);
  console.log(`\n[v2] 完成：处理作者 ${authorsDone}，回填封面 ${okTotal}`);
  console.log(`[v2] 品牌笔记 ${total} 条，已有封面 ${withCover} 条`);
  await browser.close();
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
