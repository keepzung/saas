#!/usr/bin/env node
// 小红书主站封面批量抓取（brandId=6）：登录态打开笔记页，读 __INITIAL_STATE__ 拿真实封面
// 前置：node login-xhs-web.cjs 已扫码登录（state/xhs-web-tesla.json）
// 用法:
//   node fetch-xhs-covers.cjs --limit 25     （试跑）
//   node fetch-xhs-covers.cjs                （全量，按阅读量降序，断点续传：只抓 coverUrl 为空的）
//   node fetch-xhs-covers.cjs --all-notes    （不限于投流笔记，全部缺封面笔记）
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
const limitIdx = argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? Number(argv[limitIdx + 1]) || 0 : 0;
const ALL_NOTES = argv.includes('--all-notes');
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
  if (!fs.existsSync(STATE)) {
    console.error(`缺少登录态 ${STATE}，先跑 node login-xhs-web.cjs`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  const targets = await prisma.koxNote.findMany({
    where: { brandId: BRAND_ID, coverUrl: null, ...(ALL_NOTES ? {} : { isRtbAdver: true }) },
    orderBy: { views: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: { id: true, noteId: true, noteUrl: true, title: true },
  });
  console.log(`[covers] 目标 ${targets.length} 篇（${ALL_NOTES ? '全部缺封面' : '投流笔记优先'}）`);
  let ok = 0;
  let fail = 0;
  let titleFixed = 0;
  let consecFail = 0;
  const t0 = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const n = targets[i];
    const url = n.noteUrl || `https://www.xiaohongshu.com/explore/${n.noteId}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(600);
      const info = await page.evaluate(() => {
        const pick = (il) => {
          if (!il || !il.length) return null;
          const im = il[0];
          const last = im.infoList && im.infoList[im.infoList.length - 1];
          return im.urlDefault || im.urlPre || (last && last.url) || null;
        };
        let cover = null;
        let title = null;
        try {
          const map = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.noteDetailMap;
          if (map) {
            for (const k of Object.keys(map)) {
              const wrap = map[k] || {};
              const note = wrap.note || wrap;
              if (!note) continue;
              cover = pick(note.imageList) || (note.cover && note.cover.url) || cover;
              title = note.title || note.desc || title;
              if (cover) break;
            }
          }
        } catch { /* fallthrough */ }
        if (!cover) {
          const img = document.querySelector('.note-detail img, [class*="note"] img, meta[property="og:image"]');
          cover = img ? (img.getAttribute('src') || img.getAttribute('content')) : null;
        }
        return { cover, title: title ? String(title).slice(0, 120) : null };
      });
      const cover = normalize(info && info.cover);
      const newTitle = info && info.title ? info.title.trim() : null;
      const data = {};
      if (cover) data.coverUrl = cover;
      if (newTitle && (!n.title || n.title === '(乐允投放笔记)') && newTitle !== '(乐允投放笔记)') {
        data.title = newTitle;
        titleFixed += 1;
      }
      if (Object.keys(data).length) {
        await prisma.koxNote.update({ where: { id: n.id }, data });
      }
      if (cover) {
        ok += 1;
        consecFail = 0;
      } else {
        fail += 1;
        consecFail += 1;
        if (consecFail >= 20) {
          console.log('[covers] 连续 20 次未取到（疑似风控/登录态失效），停止。可稍后续跑（断点续传）。');
          break;
        }
      }
      if ((i + 1) % 20 === 0) {
        const rate = ((Date.now() - t0) / 1000 / (i + 1)).toFixed(1);
        const eta = Math.round(((targets.length - i - 1) * (Date.now() - t0)) / (i + 1) / 60000);
        console.log(`[covers] 进度 ${i + 1}/${targets.length}，成功 ${ok}，标题补 ${titleFixed}，${rate}s/篇，剩余约 ${eta} 分钟`);
      }
    } catch (e) {
      fail += 1;
      consecFail += 1;
      if (consecFail >= 20) {
        console.log('[covers] 连续异常过多，停止。');
        break;
      }
      await sleep(1500);
    }
    await sleep(550 + Math.floor(Math.random() * 350));
  }

  console.log(`[covers] 完成：成功 ${ok} / 目标 ${targets.length}，标题补全 ${titleFixed}`);
  const [withCover, total] = await Promise.all([
    prisma.koxNote.count({ where: { brandId: BRAND_ID, coverUrl: { not: null } } }),
    prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
  ]);
  console.log(`[covers] 当前品牌笔记 ${total} 条，已有封面 ${withCover} 条`);
  await browser.close();
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
