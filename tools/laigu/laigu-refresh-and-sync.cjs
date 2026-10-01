// 来鼓一键刷新+全量补数（token 时效短，登录后立即完成全部动作）：
// 登录 pro.laigu.com（人工）→ 抓新鲜 token → 本地拉评论增量 → SSH 隧道写生产库
// 用法: HEADLESS=0 node laigu-refresh-and-sync.cjs
const { chromium } = require('../spark/node_modules/playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, 'laigu-state-laigu-tesla.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ── 1) 建 SSH 隧道（写生产库用）──
  console.log('[0] 建立 SSH 隧道（15432 → 生产库）...');
  try { execSync('powershell -c "Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
  execSync(
    'powershell -c "Start-Process ssh -ArgumentList \'-N\',\'-L\',\'15432:localhost:5432\',\'root@119.28.157.150\',\'-o\',\'ExitOnForwardFailure=yes\' -WindowStyle Hidden"',
    { stdio: 'ignore' },
  );
  await sleep(4000);
  console.log('[0] 隧道已建');

  // ── 2) 有头登录（人工）──
  const browser = await chromium.launch({ headless: false, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1600, height: 900 },
  });
  const page = await ctx.newPage();
  let authHeader = null;
  page.on('request', (req) => {
    if (/comment\/list|redbook/.test(req.url())) {
      const h = req.headers();
      if (h.authorization && /^[0-9a-f]{32,80}$/.test(h.authorization)) authHeader = h.authorization;
    }
  });
  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(4000);
  const needLogin = await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => false);
  if (needLogin) console.log('[1] >>> 请在窗口手动完成登录 <<<');
  for (let i = 0; i < 150; i++) {
    await sleep(3000);
    const onLogin = page.url().includes('/login');
    const hasPw = await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => true);
    if (!onLogin && !hasPw) break;
    if (i % 10 === 9) console.log('[1] 等待登录中...');
  }
  console.log('[1] URL:', page.url().slice(0, 90));

  // ── 3) 抓新鲜 token（评论页触发）──
  console.log('[2] 打开评论页抓新鲜 token ...');
  await page.goto('https://pro.laigu.com/comment', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(10000);
  if (!authHeader) {
    const qbtn = page.locator('button:has-text("查询"), button:has-text("搜 索")').first();
    if (await qbtn.count()) await qbtn.click({ timeout: 3000 }).catch(() => {});
    await sleep(6000);
  }
  if (!authHeader) { console.log('[!] 未抓到 token'); await page.screenshot({ path: path.join(OUT, 'sync-debug.png') }); await browser.close(); process.exit(1); }
  fs.writeFileSync(STATE, JSON.stringify(await ctx.storageState()), 'utf8');
  console.log(`[2] 新鲜 token: ${authHeader.slice(0, 20)}...`);

  // ── 4) 立即拉全量增量（09-30 16:00 起，覆盖 10-01）──
  console.log('[3] 拉评论增量 ...');
  const winStart = '2026-09-30T16:00:00+08:00';
  const allRows = [];
  for (let page2 = 1; page2 <= 60; page2++) {
    const res = await fetch('https://api-gateway-ali.meiqia.cn/spectrum/workbench/redbook/comment/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ curPage: page2, size: 100, keyword: '', channelCorpIds: [], beginCreatedAt: winStart, endCreatedAt: new Date().toISOString(), replyState: [] }),
    });
    const j = await res.json().catch(() => null);
    if (!j || j.success !== true) { console.log(`[3] page ${page2} 拉取失败: ${String(JSON.stringify(j)).slice(0, 100)}`); break; }
    const rows = j?.data?.data ?? [];
    if (!rows.length) break;
    allRows.push(...rows);
    const totalPage = Number(j?.data?.totalPage ?? 1);
    console.log(`[3] page ${page2}: +${rows.length}（累计 ${allRows.length}）`);
    if (page2 >= totalPage) break;
    await sleep(600);
  }

  // ── 5) 写生产库（经隧道）──
  console.log('[4] 写生产库 ...');
  const url = fs.readFileSync(path.join(OUT, 'prod-db-url.txt'), 'utf8').trim();
  const { PrismaClient } = require(path.join(__dirname, '../..', 'backend', 'node_modules', '@prisma', 'client'));
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let upserted = 0, created = 0;
  for (const r of allRows) {
    if (!r?.commentId) continue;
    let cover = typeof r.cover === 'string' ? r.cover.trim() : null;
    if (cover?.startsWith('http://')) cover = cover.replace(/^http:\/\//, 'https://');
    const data = {
      noteId: r.noteId ?? null, noteTitle: r.noteTitle ?? null, noteCover: cover || null,
      content: r.content ?? null, commentUserName: r.commentUserName ?? null,
      entOpenName: r.entOpenName ?? null, entOpenId: r.entOpenId ?? null,
      replyState: Number(r.replyState ?? 0), isLocalReply: r.isLocalReply ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt) : null, rawJson: r,
    };
    const exist = await prisma.laiguComment.findUnique({ where: { brandId_commentId: { brandId: 6, commentId: String(r.commentId) } } });
    if (exist) { await prisma.laiguComment.update({ where: { id: exist.id }, data }); upserted++; }
    else { await prisma.laiguComment.create({ data: { brandId: 6, commentId: String(r.commentId), ...data } }); created++; }
  }
  await prisma.laiguOrgConfig.update({ where: { brandId: 6 }, data: { gatewayToken: authHeader, lastCommentSyncAt: new Date(), lastSyncAt: new Date() } });
  const today = await prisma.laiguComment.count({ where: { brandId: 6, createdAt: { gte: new Date('2026-10-01T00:00:00+08:00') } } });
  const total = await prisma.laiguComment.count({ where: { brandId: 6 } });
  await prisma.$disconnect();
  console.log(`[4] 写库完成: 更新 ${upserted} / 新建 ${created} | 10-01 评论: ${today} | 总数: ${total}`);
  console.log('[4] 生产 token 已同步更新');
  await browser.close();
  console.log('=== 完成 ===');
})().catch((e) => { console.error(e.message); process.exit(1); });
