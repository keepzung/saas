#!/usr/bin/env node
// 探针(一次性): 专业号线索「区间直查」vs 逐日求和 口径对比 (10-01~10-18, 跑完即删)
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.env.BACKEND_DIR || '/opt/saas/backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();
let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = req('playwright-core').chromium; }

(async () => {
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: 5 } });
  if (!cfg?.storageState) throw new Error('brand5 无登录态');
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled', '--no-sandbox'] });
  const ctx = await browser.newContext({ storageState: JSON.parse(cfg.storageState), userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN', viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management?tabsKey=userList', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  if (/login|passport/i.test(page.url())) throw new Error('登录态失效');
  const out = await page.evaluate(async () => {
    const post = async (p, body) => {
      const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/' + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const R = { startTime: '2026-10-01', endTime: '2026-10-18' };
    const enter = await post('user/list', { ...R, clueEventTypeList: [1], pageNum: 1, pageSize: 5 });
    const all = await post('user/list', { ...R, clueEventTypeList: [1, 2, 3], pageNum: 1, pageSize: 5 }).catch(() => null);
    const noEv = await post('user/list', { ...R, pageNum: 1, pageSize: 5 }).catch(() => null);
    const st = await post('user/statistic', { startTime: R.startTime, endTime: R.endTime, sysTagIds: ['2', '3', '4', '11', '12'], userTagIds: [] });
    const stat = await post('clue_manager/statistical/list', { startTime: '2026-10-01 00:00:00', endTime: '2026-10-18 23:59:59', belongUserId: '', pageNum: 1, pageSize: 10 });
    return {
      enterTotal: enter?.data?.cluePageInfo?.total ?? ('err:' + (enter?.msg ?? '?')),
      enterSample: (enter?.data?.userList ?? []).slice(0, 2).map((x) => ({ uid: x.customerUserId, belong: x.belongUserName, tag: x.sysTag?.tagName })),
      allTotal: all?.data?.cluePageInfo?.total ?? (all ? 'no-field:' + JSON.stringify(all).slice(0, 80) : 'null'),
      noEvTotal: noEv?.data?.cluePageInfo?.total ?? (noEv ? 'no-field' : 'null'),
      tags: st?.data?.tagStatList ?? ('err:' + (st?.msg ?? '?')),
      toolStat: stat?.data ?? ('err:' + JSON.stringify(stat).slice(0, 120)),
    };
  });
  console.log('区间直查 进线(=[1]) total:', out.enterTotal);
  console.log('  样本:', JSON.stringify(out.enterSample));
  console.log('区间直查 进线(=[1,2,3]) total:', out.allTotal);
  console.log('区间直查 进线(无事件类型参数) total:', out.noEvTotal);
  console.log('区间 statistic 卡片:', JSON.stringify(out.tags));
  console.log('区间 获客工具统计(statistical/list 全局):', JSON.stringify(out.toolStat).slice(0, 600));
  await browser.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FAIL', String(e).slice(0, 300)); process.exit(1); });
