#!/usr/bin/env node
/* Morgandada(5) 笔记正文采集回填（星火同步不含正文，KoxNote.content 恒空 →
 *   品类打标只能靠标题；正文补齐后标题+正文+话题联合归类，并供笔记明细直接展示内容）
 * 前置：小红书登录态 state/auth-mdd.json（无则先 node xhs-login-save.cjs state/auth-mdd.json）
 * 用法:
 *   node fill-mdd-note-content.cjs                # 全量（只处理 content 为空的，断点续传）
 *   node fill-mdd-note-content.cjs --limit 50     # 限量试跑
 *   node fill-mdd-note-content.cjs --dry-run      # 只统计不写库
 *   XHS_STATE=auth-other.json node ...            # 指定其他登录态文件
 * 限频：2~4s/篇（含随机抖动），单篇超时跳过不中断整批 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const STATE_FILE = path.join(__dirname, 'state', process.env.XHS_STATE || 'auth-mdd.json');
const MAX_LEN = 5000;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const LIMIT = Number(argOf('--limit', 0)) || Infinity;
const BRAND_ID = Number(argOf('--brandId', 5)) || 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser() {
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
  if (!fs.existsSync(STATE_FILE)) throw new Error(`缺少小红书登录态 ${STATE_FILE}，先执行: node xhs-login-save.cjs state/auth-mdd.json`);
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  return { browser, ctx };
}

/** 登录态打开笔记页读正文：DOM 全文优先，og:description 摘要兜底 */
async function fetchContent(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    let text = await page.evaluate(() => {
      const sels = ['#detail-desc .note-text', '#detail-desc', '.note-content', '[class*="note-text"]', '[class*="desc"]'];
      for (const s of sels) {
        const el = document.querySelector(s);
        const t = el?.innerText?.trim();
        if (t && t.length > 10) return t;
      }
      return '';
    });
    if (!text) {
      text = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '') ;
    }
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > 10 ? clean.slice(0, MAX_LEN) : null;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const rows = await p.koxNote.findMany({
    where: { brandId: BRAND_ID, content: null, noteUrl: { not: null, notIn: [''] } },
    select: { id: true, noteId: true, noteUrl: true, title: true },
    orderBy: { publishTime: 'desc' },
    take: LIMIT === Infinity ? undefined : LIMIT,
  });
  console.log(`MDD(${BRAND_ID}) 待采集正文: ${rows.length} 条${DRY_RUN ? '（dry-run）' : ''}`);
  if (!rows.length || DRY_RUN) {
    await p.$disconnect();
    return;
  }
  const { browser, ctx } = await launchBrowser();
  let ok2 = 0;
  let miss = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const text = await fetchContent(ctx, r.noteUrl);
    if (text) {
      await p.koxNote.update({ where: { id: r.id }, data: { content: text } });
      ok2 += 1;
    } else {
      miss += 1;
    }
    if ((i + 1) % 20 === 0) console.log(`  进度 ${i + 1}/${rows.length} 成功${ok2} 未取到${miss}`);
    await sleep(2000 + Math.floor(Math.random() * 2000));
  }
  console.log(`完成：成功 ${ok2} / 未取到 ${miss} / 共 ${rows.length}`);
  await browser.close();
  await p.$disconnect();
})().catch((e) => { console.error('error:', String(e).slice(0, 300)); process.exitCode = 1; });
