#!/usr/bin/env node
// Morgandada(5) 笔记封面采集回填（替换前端特斯拉车图兜底，后续新笔记可重复跑）：
//  来源 A：fetch 笔记页 og:image（零风险；xhs 对无登录态抓取常返回通用假图，自动识别丢弃）
//  来源 B：浏览器登录态打开笔记页读 DOM 渲染封面（真实封面主来源，需 xhs 登录态）
//  落库：外链封面镜像到 backend/uploads/covers/<noteId>.jpg 并改写 coverUrl（摆脱 CDN 防盗链/失效）
// 前置：无登录态或失效时先跑一次扫码登录 → node xhs-login-save.cjs state/auth-mdd.json
// 用法:
//   node backfill-mdd-covers.cjs                # 全量（只处理 coverUrl 为空的，断点续传）
//   node backfill-mdd-covers.cjs --limit 100    # 限量
//   node backfill-mdd-covers.cjs --dry-run      # 只统计不写库
//   node backfill-mdd-covers.cjs --no-mirror    # 只写外链不下载到本地
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const COVER_DIR = path.join(ROOT, 'backend', 'uploads', 'covers');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GENERIC_OG = 'picasso-static.xiaohongshu.com/fe-platform/';
const STATE_FILE = path.join(__dirname, 'state', process.env.XHS_STATE || 'auth-mdd.json');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const NO_MIRROR = argv.includes('--no-mirror');
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const LIMIT = Number(argOf('--limit', 0)) || Infinity;
const BRAND_ID = Number(argOf('--brandId', 5)) || 5;
// 排序：views=阅读量优先（第一页/热门内容优先补齐），publishTime=最新优先（默认）
const ORDER = argOf('--order', 'publishTime') === 'views' ? { views: 'desc' } : { publishTime: 'desc' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRealCover = (u) => {
  if (!u) return false;
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('http://')) s = s.replace(/^http:\/\//, 'https://');
  if (!/^https:\/\//.test(s)) return false;
  if (s.includes(GENERIC_OG)) return false; // xhs 对抓取器恒返回的通用假图
  return /xhscdn\.com|xiaohongshu\.com/.test(s);
};
const norm = (u) => {
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  return s.startsWith('http://') ? s.replace(/^http:\/\//, 'https://') : s;
};

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

async function launchBrowser() {
  // 与 keepalive-daemon 一致：playwright-core + 本地已装 chromium（全量 playwright 包要求的 headless_shell 版本常缺失）
  const pc = backendRequire('playwright-core');
  const findChromium = () => {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    if (process.env.CHROMIUM_BIN && fs.existsSync(process.env.CHROMIUM_BIN)) return process.env.CHROMIUM_BIN;
    const bases = [
      path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'ms-playwright'),
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    ].filter(Boolean);
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
      for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
        const exe = path.join(base, d, sub);
        if (fs.existsSync(exe)) return exe;
      }
    }
    return null;
  };
  const exe = findChromium();
  const chromium = { launch: (opts) => pc.chromium.launch({ ...opts, executablePath: exe ?? undefined }) };
  if (!fs.existsSync(STATE_FILE)) {
    // 不中断整批：og:image 快路径照常跑，仅跳过浏览器兜底分支（调用方判 null）
    console.warn(`[warn] 缺少小红书登录态 ${STATE_FILE}，仅用 og:image 采集，浏览器兜底已跳过。`);
    console.warn('       如需浏览器兜底请先执行: node xhs-login-save.cjs state/auth-mdd.json');
    return null;
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  return { browser, ctx };
}

/** 登录态打开笔记页，读 DOM 渲染出的封面图 */
async function browserCover(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let cover = null;
    try {
      const img = page.locator('.note-detail img, .note-container img, [class*="note"] img').first();
      await img.waitFor({ state: 'visible', timeout: 12000 });
      cover = await img.evaluate((el) => el.getAttribute('src'));
    } catch { /* fallthrough */ }
    if (!isRealCover(cover)) {
      cover = await page.evaluate(() => {
        const m = document.querySelector('meta[property="og:image"]');
        return m ? m.getAttribute('content') : null;
      });
    }
    return isRealCover(cover) ? norm(cover) : null;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.xiaohongshu.com/' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`too small ${buf.length}B`);
  fs.writeFileSync(file, buf);
}

(async () => {
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const rows = await p.koxNote.findMany({
    where: { brandId: BRAND_ID, coverUrl: null, noteUrl: { not: null, notIn: [''] } },
    select: { id: true, noteId: true, noteUrl: true },
    orderBy: ORDER,
    take: LIMIT === Infinity ? undefined : LIMIT,
  });
  console.log(`MDD(${BRAND_ID}) 待采集封面: ${rows.length} 条${DRY_RUN ? '（dry-run）' : ''}`);
  if (!rows.length) {
    console.log('无缺失封面，结束');
    await p.$disconnect();
    return;
  }

  let ogOk = 0;
  let browserOk = 0;
  let mirrorOk = 0;
  let fail = 0;
  let skippedNoState = 0;
  let consecutiveFails = 0;
  let done = 0;
  let ctx = null;
  let browser = null;
  let browserUnavailable = false;

  for (const r of rows) {
    done += 1;
    const local = path.join(COVER_DIR, `${r.noteId}.jpg`);
    let cover = null;
    // 来源 A：og:image 快路径
    const og = await fetchOgImage(r.noteUrl);
    if (isRealCover(og)) {
      cover = norm(og);
      ogOk += 1;
    } else if (og && !DRY_RUN && !NO_MIRROR && fs.existsSync(local)) {
      cover = `/uploads/covers/${r.noteId}.jpg`; // 已镜像过
    }
    // 来源 B：登录态浏览器 DOM（登录态缺失时跳过，不中断）
    if (!cover) {
      if (browserUnavailable) {
        skippedNoState += 1;
        continue;
      }
      if (!ctx) {
        ({ browser, ctx } = await launchBrowser());
        if (!ctx) {
          browserUnavailable = true;
          skippedNoState += 1;
          continue;
        }
      }
      cover = await browserCover(ctx, r.noteUrl);
      if (cover) {
        browserOk += 1;
        consecutiveFails = 0;
      } else {
        consecutiveFails += 1;
        // 风控退避：连续失败 ≥3 次 → 冷却 90s 再试；连续 8 次 → 判定被限流，终止本次（稍后重跑只补缺口）
        if (consecutiveFails >= 8) {
          console.error(`[abort] 连续 ${consecutiveFails} 次未取到封面，疑似触发风控/安全验证。已入库 ${ogOk + browserOk} 条，请 30-60 分钟后重跑补齐。`);
          break;
        }
        if (consecutiveFails >= 3) {
          console.log(`  连续失败 ${consecutiveFails} 次，冷却 90s 后继续…`);
          await sleep(90000);
        }
      }
      await sleep(5000 + Math.floor(Math.random() * 6000)); // 限速 5-11s/条，降低风控风险
    }
    if (!cover) {
      fail += 1;
      if (fail % 25 === 1) console.log(`  未取到封面样例 noteId=${r.noteId} url=${r.noteUrl}`);
      continue;
    }
    if (!DRY_RUN) {
      // 镜像到本地（og 外链才需要下载；浏览器拿到的已是可直链 xhscdn，同样镜像防失效）
      if (!NO_MIRROR && /^https:/.test(cover)) {
        try {
          await download(cover, local);
          cover = `/uploads/covers/${r.noteId}.jpg`;
          mirrorOk += 1;
        } catch (e) {
          if (mirrorOk === 0 && fail === 0) console.log(`  镜像失败（保留外链）: ${e.message}`);
        }
      }
      await p.koxNote.update({ where: { id: r.id }, data: { coverUrl: cover } });
    }
    if (done % 10 === 0) console.log(`  进度 ${done}/${rows.length} · og:${ogOk} 浏览器:${browserOk} 镜像:${mirrorOk} 失败:${fail}`);
  }

  if (browser) await browser.close().catch(() => {});
  console.log(`完成：处理 ${done}，og:image ${ogOk}，浏览器 ${browserOk}，镜像 ${mirrorOk}，失败 ${fail}${skippedNoState ? `，缺登录态跳过 ${skippedNoState}` : ''}${DRY_RUN ? '（dry-run 未写库）' : ''}`);
  await p.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
