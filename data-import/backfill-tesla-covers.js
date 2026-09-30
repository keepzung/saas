#!/usr/bin/env node
// 特斯拉笔记封面回填（brandId=6）
// 背景：33,117 条乐允导出笔记 coverUrl 全空，前端此前用原站演示 webp 兜底（MINI 车图，客户不可接受）
// 来源 A（零风险）：来鼓评论自带 noteCover（评论接口返回字段），按 noteId 回填
// 来源 B（可选 --crawl）：按阅读 TOP 笔记经 noteUrl(带 xsec_token) 抓 og:image
// 用法:
//   node backfill-tesla-covers.js                     # 来鼓封面回填 + 存量修正
//   node backfill-tesla-covers.js --crawl --limit 300 # 另加 og:image 抓取（已证实为通用假图，仅浏览器兜底有效）
//   node backfill-tesla-covers.js --fix-existing      # 仅修正存量（http→https、清通用假图）
//   node backfill-tesla-covers.js --dry-run           # 只统计不写库
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const BRAND_ID = 6;

const DRY_RUN = process.argv.includes('--dry-run');
const CRAWL = process.argv.includes('--crawl');
// 存量修正默认随跑（幂等：http→https、清通用假图）
const FIX_EXISTING = true;
const limitIdx = process.argv.indexOf('--limit');
const CRAWL_LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) || 300 : 300;

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 封面 URL 归一：http→https（混合内容拦截）；识别 xhs 通用假图（og:image 对抓取器恒返回此图，非真实封面）
const GENERIC_OG = 'picasso-static.xiaohongshu.com/fe-platform/';
const normalizeCover = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = s.replace(/^http:\/\//, 'https://');
  if (s.includes(GENERIC_OG)) return null;
  return s;
};

/** 纯 fetch 抓 og:image（explore 页对带 xsec_token 的链接通常直接出 SSR） */
async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1].replace(/&amp;/g, '&') : null;
  } catch {
    return null;
  }
}

/** 浏览器兜底（og:image 已证实为通用假图）：登录态打开笔记页，读取 DOM 渲染出的封面 img */
async function browserOgImage(url, stateFile) {
  const sparkRequire = createRequire(path.join(ROOT, 'tools', 'spark', 'package.json'));
  const { chromium } = sparkRequire('playwright');
  const exe = (() => {
    try {
      const p = chromium.executablePath();
      if (p && fs.existsSync(p)) return p;
    } catch { /* fallthrough */ }
    const base = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
      : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux']) {
        const exe = path.join(base, d, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
        if (fs.existsSync(exe)) return exe;
      }
    }
    return null;
  })();
  const browser = await chromium.launch({
    executablePath: exe ?? undefined,
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const ctx = await browser.newContext({
      storageState: JSON.parse(fs.readFileSync(stateFile, 'utf8')),
      userAgent: UA,
      locale: 'zh-CN',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 等正文封面图渲染（小红书 DOM：.note-detail img / 笔记图区域）
    let cover = null;
    try {
      const img = page.locator('.note-detail img, .note-container img, [class*="note"] img').first();
      await img.waitFor({ state: 'visible', timeout: 12000 });
      cover = await img.evaluate((el) => el.getAttribute('src'));
    } catch { /* fallthrough */ }
    if (!cover) {
      cover = await page.evaluate(() => {
        const m = document.querySelector('meta[property="og:image"]');
        return m ? m.getAttribute('content') : null;
      });
    }
    return cover;
  } finally {
    await browser.close();
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // ─── 来源 0：存量封面修正（默认随跑，幂等）───
    // 1) http:// 封面 → https://（混合内容拦截）；2) xhs 通用假图（fe-platform）置空
    if (FIX_EXISTING) {
      const bad = await prisma.koxNote.findMany({
        where: { brandId: BRAND_ID, coverUrl: { not: null } },
        select: { id: true, coverUrl: true },
      });
      let httpsFixed = 0;
      let genericCleared = 0;
      for (const n of bad) {
        const cover = normalizeCover(n.coverUrl);
        if (cover === n.coverUrl) continue;
        if (!DRY_RUN) {
          await prisma.koxNote.update({ where: { id: n.id }, data: { coverUrl: cover } });
        }
        if (cover) httpsFixed++;
        else genericCleared++;
      }
      console.log(`[0] 存量修正：http→https ${httpsFixed} 条，通用假图置空 ${genericCleared} 条${DRY_RUN ? '（dry-run 未写库）' : ''}`);
    }

    // ─── 来源 A：来鼓评论封面 ───
    const comments = await prisma.laiguComment.findMany({
      where: { brandId: BRAND_ID, noteCover: { not: null }, noteId: { not: null } },
      select: { noteId: true, noteCover: true },
    });
    const coverByNote = new Map();
    for (const c of comments) {
      const cover = normalizeCover(c.noteCover);
      if (c.noteId && cover && !coverByNote.has(c.noteId)) coverByNote.set(c.noteId, cover);
    }
    const noteIds = [...coverByNote.keys()];
    const matched = noteIds.length
      ? await prisma.koxNote.findMany({
          where: { brandId: BRAND_ID, noteId: { in: noteIds }, coverUrl: null },
          select: { id: true, noteId: true },
        })
      : [];
    console.log(`[A] 来鼓评论封面 ${coverByNote.size} 个笔记，匹配待回填 ${matched.length} 条`);
    let aDone = 0;
    for (const n of matched) {
      if (!DRY_RUN) {
        await prisma.koxNote.update({ where: { id: n.id }, data: { coverUrl: coverByNote.get(n.noteId) } });
      }
      aDone++;
    }
    console.log(`[A] 回填 ${aDone} 条${DRY_RUN ? '（dry-run 未写库）' : ''}`);

    // ─── 来源 B：TOP 笔记 og:image 抓取 ───
    if (CRAWL) {
      const stateFile = path.join(ROOT, 'tools', 'spark', 'state', 'auth-tesla2.json');
      const targets = await prisma.koxNote.findMany({
        where: { brandId: BRAND_ID, coverUrl: null, noteUrl: { not: null } },
        orderBy: { views: 'desc' },
        take: CRAWL_LIMIT,
        select: { id: true, noteUrl: true, views: true },
      });
      console.log(`[B] 抓取 TOP ${targets.length} 条（按阅读；纯 fetch 已证实只回通用假图，主力=登录态浏览器 DOM 封面）`);
      let ok = 0;
      let consecFail = 0;
      for (let i = 0; i < targets.length; i++) {
        const n = targets[i];
        // 1) 纯 fetch og:image（快，但命中通用假图会被 normalize 拒绝）
        // 2) 登录态浏览器读 DOM 渲染封面（慢，~4s/条）
        let cover = normalizeCover(await fetchOgImage(n.noteUrl));
        if (!cover && fs.existsSync(stateFile)) {
          cover = normalizeCover(await browserOgImage(n.noteUrl, stateFile));
          await sleep(800);
        }
        if (cover) {
          if (!DRY_RUN) await prisma.koxNote.update({ where: { id: n.id }, data: { coverUrl: cover } });
          ok++;
          consecFail = 0;
          if (ok % 10 === 0) console.log(`[B] 进度 ${i + 1}/${targets.length}，成功 ${ok}`);
        } else {
          consecFail++;
          console.log(`[B] 未取到封面(${consecFail}连败): ${n.noteUrl.slice(0, 72)}`);
          // 连续 15 次失败视为风控/选择器失效，停止避免长时间挂机
          if (consecFail >= 15) {
            console.log('[B] 连续失败过多，提前收兵');
            break;
          }
        }
        await sleep(300);
      }
      console.log(`[B] 完成：成功 ${ok}，共处理 ${targets.length} 条${DRY_RUN ? '（dry-run 未写库）' : ''}`);
    }

    const [withCover, total] = await Promise.all([
      prisma.koxNote.count({ where: { brandId: BRAND_ID, coverUrl: { not: null } } }),
      prisma.koxNote.count({ where: { brandId: BRAND_ID } }),
    ]);
    console.log(`\n=== 完成 === brand ${BRAND_ID} 笔记 ${total} 条，已有封面 ${withCover} 条`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('回填失败:', e);
  process.exit(1);
});
