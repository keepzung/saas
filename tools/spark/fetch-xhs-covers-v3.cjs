#!/usr/bin/env node
// 封面补抓 v3：站内搜索（标题）→ 拦截 search/notes 响应 → 按 noteId 精确匹配拿封面
// 用途：作者主页翻不到的老爆款（作者列表只含近期笔记，旧 xsec_token 已过期）
// 用法:
//   node fetch-xhs-covers-v3.cjs --limit 10   （试跑）
//   node fetch-xhs-covers-v3.cjs --limit 500  （按阅读降序补 500 篇）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(__dirname, 'package.json'));
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { chromium } = sparkRequire('playwright');
const { PrismaClient } = backendRequire('@prisma/client');

const BRAND_ID = 6;
const STATE = path.join(__dirname, 'state', 'xhs-web-tesla.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const lIdx = argv.indexOf('--limit');
const LIMIT = lIdx > -1 ? Number(argv[lIdx + 1]) || 100 : 100;
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

(async () => {
  const prisma = new PrismaClient();
  const targets = await prisma.koxNote.findMany({
    where: { brandId: BRAND_ID, coverUrl: null, AND: [{ title: { not: '(乐允投放笔记)' } }, { title: { not: '' } }] },
    orderBy: { views: 'desc' },
    take: LIMIT,
    select: { id: true, noteId: true, title: true, views: true },
  });
  console.log(`[v3] 目标 ${targets.length} 篇（按阅读降序，有标题）`);
  if (!targets.length) process.exit(0);

  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  let searchResults = new Map(); // noteId -> cover
  let blocked = false;
  const onResponse = (res) => {
    if (!res.url().includes('/api/sns/web/v1/search/notes')) return;
    res
      .json()
      .then((j) => {
        if (j?.code === -100 || j?.code === 461) { blocked = true; return; }
        const items = j?.data?.items;
        if (!Array.isArray(items)) return;
        for (const it of items) {
          const id = it.id || it.note_id;
          if (!id || searchResults.has(id)) continue;
          const card = it.note_card || it;
          const cover =
            normalize(card.cover?.url) ||
            normalize(card.cover?.url_default) ||
            (Array.isArray(card.cover?.info_list) ? normalize(card.cover.info_list.at(-1)?.url) : null) ||
            normalize(card.cover);
          searchResults.set(id, cover);
        }
      })
      .catch(() => {});
  };
  page.on('response', onResponse);

  let ok = 0;
  let miss = 0;
  const t0 = Date.now();
  for (let i = 0; i < targets.length; i++) {
    const n = targets[i];
    if (blocked) {
      console.log('[v3] 搜索接口风控（code -100/461），停止。稍后断点续传。');
      break;
    }
    try {
      searchResults = new Map();
      const kw = encodeURIComponent(n.title.slice(0, 30));
      await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${kw}&source=web_explore_feed`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(3500);
      // 搜索结果直接渲染在 DOM：卡片 section > a[href*=/explore/<id>] + img
      const cover = await page.evaluate((targetId) => {
        const pick = (img) => {
          if (!img) return null;
          return img.getAttribute('src') || img.getAttribute('data-src') || null;
        };
        const sections = document.querySelectorAll('section');
        for (const card of sections) {
          const a = card.querySelector('a[href*="/explore/"], a[href*="/search_result/"]');
          if (!a) continue;
          const m = (a.getAttribute('href') || '').match(/(?:explore|search_result)\/([0-9a-f]{16,32})/);
          if (!m || m[1] !== targetId) continue;
          const src = pick(card.querySelector('img'));
          if (src) return src;
        }
        return null;
      }, n.noteId);
      const normalized = normalize(cover);
      if (normalized) {
        await prisma.koxNote.update({ where: { id: n.id }, data: { coverUrl: normalized } });
        ok += 1;
      } else {
        miss += 1;
      }
      if ((i + 1) % 10 === 0) {
        const eta = Math.round(((targets.length - i - 1) * (Date.now() - t0)) / (i + 1) / 60000);
        console.log(`[v3] 进度 ${i + 1}/${targets.length}，命中 ${ok}，未中 ${miss}，剩余约 ${eta} 分钟`);
      }
    } catch (e) {
      miss += 1;
      await sleep(2000);
    }
    await sleep(1800 + Math.floor(Math.random() * 1200));
  }

  console.log(`[v3] 完成：命中 ${ok} / ${targets.length}`);
  const [withCover, total] = await Promise.all([
    prisma.koxNote.count({ where: { brandId: BRAND_ID, coverUrl: { not: null } } }),
    prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
  ]);
  console.log(`[v3] 品牌笔记 ${total} 条，已有封面 ${withCover} 条`);
  await browser.close();
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
