#!/usr/bin/env node
// 生产端到端自检：签 JWT → 加关键词 → 真实抓取 → 触发拆解 → 轮询结果
// 在服务器上执行: node /opt/saas/tools/hotspot/prod-e2e-check.cjs [brandId] [keyword] [platform]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire('/opt/saas/backend/package.json');
const jwt = backendRequire('jsonwebtoken');
const { PrismaClient } = backendRequire('@prisma/client');

const BRAND = Number(process.argv[2] ?? 6);
const KEYWORD = process.argv[3] ?? '特斯拉';
const PLATFORM = process.argv[4] ?? 'bilibili';
const BASE = 'http://127.0.0.1:3000/api/agency-api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  const m = env.match(/JWT_SECRET="?([^"\r\n]+)"?/);
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role }, m[1], { expiresIn: '30m' });
  const H = { token, 'Content-Type': 'application/json' };
  const j = async (res) => (await res.json());

  // 1) 关键词（存在即跳过）
  const kw = await j(await fetch(`${BASE}/hotspot/keywords`, { method: 'POST', headers: H, body: JSON.stringify({ brandId: BRAND, keyword: KEYWORD }) }));
  console.log('[1] keyword:', kw.code === 100 ? 'added' : `code=${kw.code}(${kw.msg === 'success' ? '已存在' : kw.msg})`);

  // 2) 真实抓取（--no-scrape 跳过：XHS 等平台抓取只在本机跑，这里只验拆解）
  if (!process.argv.includes('--no-scrape')) {
    const run = await j(await fetch(`${BASE}/hotspot/scrape/run`, { method: 'POST', headers: H, body: JSON.stringify({ brandId: BRAND, platform: PLATFORM, keyword: KEYWORD }) }));
    console.log('[2] scrape:', JSON.stringify(run.data ?? run));
    if (run.code !== 100) process.exit(1);
  } else {
    console.log('[2] scrape: skipped (--no-scrape)');
  }

  // 3) 播放最高的一条触发拆解
  const list = await j(await fetch(`${BASE}/hotspot/contents?brandId=${BRAND}&platform=${PLATFORM}&sort=views&pageSize=3`, { headers: { token } }));
  const top = list.data?.items?.[0];
  console.log('[3] top:', top ? `${top.title.slice(0, 42)} views=${top.view_count}` : 'NONE');
  if (!top) process.exit(1);
  const bd = await j(await fetch(`${BASE}/hotspot/breakdown`, { method: 'POST', headers: H, body: JSON.stringify({ brandId: BRAND, contentId: top.id }) }));
  console.log('[4] breakdown request:', JSON.stringify(bd.data ?? bd));

  // 4) 轮询拆解结果（最长 6 分钟）
  for (let i = 0; i < 36; i++) {
    await sleep(10000);
    const rows = await j(await fetch(`${BASE}/hotspot/breakdowns?brandId=${BRAND}&pageSize=1`, { headers: { token } }));
    const row = rows.data?.items?.[0];
    if (row && (row.status === 'done' || row.status === 'failed')) {
      console.log(`[5] breakdown ${row.status}:`, row.status === 'done'
        ? `hook=${(row.hook ?? '').slice(0, 60)} | stages=${(row.structure ?? []).length} | styles=${JSON.stringify(row.styleTags)} | partial=${row.partial}`
        : `err=${(row.errorMsg ?? '').slice(0, 150)}`);
      process.exit(row.status === 'done' ? 0 : 1);
    }
    if (i % 3 === 0) console.log(`    poll ${i}: ${row?.status ?? 'no-row'}`);
  }
  console.log('[5] timeout');
  process.exit(1);
})().catch((e) => {
  console.error('E2E FAIL:', e.message);
  process.exit(1);
});
