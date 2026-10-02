#!/usr/bin/env node
// mcc 引导登录（本地有头浏览器，人工完成滑块/验证）→ cookie 写入 DATABASE_URL 指向的库（配合 SSH 隧道写生产库）
// 用法:
//   HEADLESS=0 DATABASE_URL=postgresql://...node login-mcc-once.cjs --brandId 7
// 流程: 打开 mcc/login → 人工完成登录（滑块/验证）→ 监测离开 /login → 抓取 cookie → 写 sparkOrgConfig → 退出
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const argv = process.argv.slice(2);
const brandId = Number(argv[argv.indexOf('--brandId') + 1]);
if (!brandId) { console.error('用法: node login-mcc-once.cjs --brandId <N>  （HEADLESS=0 + DATABASE_URL 指向目标库）'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prisma = new PrismaClient();
  const headless = process.env.HEADLESS === '1';
  const browser = await chromium.launch({ headless, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  console.log(`[brand${brandId}] 打开 mcc 登录页，请在浏览器中完成登录（滑块/验证码人工处理）...`);
  await page.goto('https://mcc.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // 最多等 15 分钟人工登录
  let ok = false;
  for (let i = 0; i < 300; i++) {
    await sleep(3000);
    const url = page.url();
    if (!/login|passport/i.test(url)) { ok = true; break; }
    if (i % 20 === 19) console.log(`  仍在等待人工登录... (${(i + 1) * 3}s)`);
  }
  if (!ok) { console.error('[fail] 15 分钟内未完成登录'); await browser.close(); await prisma.$disconnect(); process.exit(1); }
  console.log(`[brand${brandId}] 登录成功 (${page.url().slice(0, 60)})，抓取 cookie...`);
  await sleep(3000);
  const stateJson = await ctx.storageState();
  const cookieStr = (stateJson.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
  if (!cookieStr) { console.error('[fail] 未抓到 cookie'); await browser.close(); await prisma.$disconnect(); process.exit(1); }
  const cur = await prisma.sparkOrgConfig.findUnique({ where: { brandId } });
  if (cur) {
    await prisma.sparkOrgConfig.update({ where: { brandId }, data: { cookie: cookieStr, lastSyncAt: new Date() } });
  } else {
    await prisma.sparkOrgConfig.create({ data: { brandId, orgCode: '', channel: 'mcc', active: true, cookie: cookieStr, remark: `mcc 引导登录 ${new Date().toISOString().slice(0, 10)}` } });
  }
  console.log(`[brand${brandId}] cookie 已写入 (${cookieStr.length} chars) ✓`);
  await browser.close();
  await prisma.$disconnect();
  console.log('=== 引导登录完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
