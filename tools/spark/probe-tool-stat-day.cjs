// 一次性探针：专业号「客户管理-获客工具统计」历史日期可查性验证（九月留资补拉前置检查）
// 用法: node probe-tool-stat-day.cjs [2026-09-10 2026-09-15 ...]  不传参默认探测 4 个九月日 + 1 个十月对照
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CLUE_PAGE = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';

(async () => {
  const prisma = new PrismaClient();
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: 6 } });
  await prisma.$disconnect();
  if (!cfg?.storageState) { console.error('DB 无 storageState'); process.exit(1); }
  const state = JSON.parse(cfg.storageState);

  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 1000 }, storageState: state });
  const page = await ctx.newPage();
  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  if (/login|passport/i.test(page.url())) { console.error('登录态失效, url=', page.url()); await browser.close(); process.exit(2); }
  console.log('登录态 OK, url=', page.url().slice(0, 60));

  const days = process.argv.slice(2);
  if (!days.length) days.push('2026-09-10', '2026-09-15', '2026-09-20', '2026-09-25', '2026-10-15');
  for (const day of days) {
    const j = await page.evaluate(async ({ day }) => {
      const r = await fetch('https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId: '', pageNum: 1, pageSize: 10 }),
      });
      return r.json().catch(() => null);
    }, { day }).catch((e) => ({ _err: String(e).slice(0, 80) }));
    const dKey = day.replace(/-/g, '');
    const row = (j?.data?.userStatisticalDatas ?? []).find((x) => String(x.dtm) === dKey) ?? null;
    console.log(day, '| code=', j?.code ?? j?._err ?? 'null',
      '| 行=', row ? '有' : '无',
      row ? `| 进线=${row.enterUserCnt ?? row.enterCnt ?? '?'} 留资=${row.msgLeadsUserCnt ?? '?'}` : '');
    await new Promise((r2) => setTimeout(r2, 800));
  }
  await browser.close();
  process.exit(0);
})();
