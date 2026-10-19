#!/usr/bin/env node
// 一次性探针: 用 ProOrgConfig(brand5) 登录态 dump 线索用户列表完整行字段 + 流量筛选参数验证 (跑完即删)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.env.BACKEND_DIR || '/opt/saas/backend', 'package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();
let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = req('playwright-core').chromium; }

(async () => {
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: 5 } });
  if (!cfg?.storageState) throw new Error('ProOrgConfig brand5 无登录态');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({ storageState: JSON.parse(cfg.storageState), userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN', viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management?tabsKey=userList', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  if (/login|passport/i.test(page.url())) throw new Error('登录态失效: ' + page.url());
  const out = await page.evaluate(async () => {
    const post = async (p, body) => {
      const r = await fetch('https://pro.xiaohongshu.com/ads/api/clue/' + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      return r.json().catch(() => null);
    };
    const full = await post('user/list', { startTime: '2026-10-17', endTime: '2026-10-17', clueEventTypeList: [3], pageNum: 1, pageSize: 2 });
    // 尝试流量类型筛选参数（常见命名枚举）
    const flowTry = {};
    for (const key of ['flowType', 'trafficType', 'sourceType', 'adType']) {
      for (const v of [1, 2]) {
        const j = await post('user/list', { startTime: '2026-10-17', endTime: '2026-10-17', clueEventTypeList: [3], pageNum: 1, pageSize: 5, [key]: v });
        flowTry[`${key}=${v}`] = j?.code === 0 ? (j?.data?.cluePageInfo?.total ?? 'n/a') : `err:${String(j?.msg).slice(0, 30)}`;
      }
    }
    return { row: full?.data?.userList?.[0] ?? null, total: full?.data?.cluePageInfo?.total ?? null, flowTry };
  });
  console.log('留资(10-17) total:', out.total);
  console.log('完整行字段:', out.row ? Object.keys(out.row).join(',') : 'none');
  console.log('完整行样例:', JSON.stringify(out.row).slice(0, 900));
  console.log('流量筛选参数试探:', JSON.stringify(out.flowTry));
  await browser.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FAIL', String(e).slice(0, 300)); process.exit(1); });
