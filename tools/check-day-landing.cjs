#!/usr/bin/env node
// 单日落库检查器(P2/可观测配套):核某个自然日在页面同款接口+底表里的落库情况。
// 用法: node check-day-landing.cjs --date=2026-11-25 [--json]
// 输出逐品牌: 总览发布/曝光/漏斗 + 笔记列表篇数 + 底表(NOTE/NDS/CAMP/CLUE)行数;
// 退出码: 0=全部品牌笔记已落库, 1=存在品牌笔记为 0(让包装脚本决定是否触发同步补一轮)。
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const jwt = backendRequire('jsonwebtoken');
for (const l of fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { PrismaClient } = backendRequire('@prisma/client');
const p = new PrismaClient();
const secret = (fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8').match(/JWT_SECRET="([^"]+)"/) || [])[1];
const API = 'http://127.0.0.1:3000/api/agency-api';
const BRANDS = [2, 5, 6, 7, 8];
const NAMES = { 2: '荣威', 5: 'MDD', 6: '特斯拉', 7: '奕境', 8: '格力' };

const argVal = (k) => {
  const i = process.argv.indexOf(k);
  if (i > -1) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  return eq ? eq.slice(k.length + 1) : null;
};
const DAY = argVal('--date') || new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const outJson = process.argv.includes('--json');

(async () => {
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  const result = [];
  for (const b of BRANDS) {
    const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: b }, secret, { expiresIn: '30m' });
    const H = { token };
    const row = { brandId: b, brand: NAMES[b] };
    try {
      const r = await fetch(`${API}/kox/overview?brandId=${b}&start=${DAY}&end=${DAY}`, { headers: H });
      const j = await r.json();
      const d = j?.data ?? j;
      row.summary = { item_cnt: d?.summary?.item_cnt ?? -1, exposure_sum: d?.summary?.exposure_sum ?? -1 };
      const lf = d?.lead_funnel;
      if (lf) row.funnel = { inquiries: lf.pm_inquiries, openings: lf.pm_openings, leads: lf.pm_leads };
    } catch (e) { row.summary = { err: String(e.message).slice(0, 40) }; }
    try {
      const r = await fetch(`${API}/kox/notes?brandId=${b}&start=${DAY}&end=${DAY}&metric=views&page_size=1`, { headers: H });
      const j = await r.json();
      const d = j?.data ?? j;
      row.notes_published = d?.total ?? -1;
    } catch { row.notes_published = -1; }
    result.push(row);
  }
  // 底表核对
  const camp = await p.$queryRawUnsafe(`SELECT "brandId" b, count(*)::int c, COALESCE(round(sum("fee")),0)::int f FROM "KoxCampaignDailyStat" WHERE "statDate"='${DAY}' GROUP BY 1`);
  const rowNotes = await p.$queryRawUnsafe(`SELECT "brandId" b, count(*)::int c FROM "KoxNote" WHERE "publishTime">='${DAY}' AND "publishTime"<'${DAY}'::date + 1 GROUP BY 1`);
  const nds = await p.$queryRawUnsafe(`SELECT "brandId" b, count(*)::int c FROM "KoxNoteDailyStat" WHERE "day"='${DAY}' GROUP BY 1`);
  const clue = await p.$queryRawUnsafe(`SELECT "brandId" b, count(*)::int c FROM "ClueAnalysisDaily" WHERE "day"='${DAY}' GROUP BY 1`);
  const cmap = new Map(camp.map((x) => [Number(x.b), x]));
  const nmap = new Map(rowNotes.map((x) => [Number(x.b), x.c]));
  const dmap = new Map(nds.map((x) => [Number(x.b), x.c]));
  const cluemap = new Map(clue.map((x) => [Number(x.b), x.c]));
  await p.$disconnect();

  for (const row of result) {
    row.db_campaign_rows = cmap.get(row.brandId)?.c ?? 0;
    row.db_campaign_fee = cmap.get(row.brandId)?.f ?? 0;
    row.db_note_rows = nmap.get(row.brandId) ?? 0;
    row.db_nds_rows = dmap.get(row.brandId) ?? 0;
    row.db_clue_rows = cluemap.get(row.brandId) ?? 0;
    row.notes_landed = row.notes_published > 0 || row.db_note_rows > 0 || row.db_nds_rows > 0;
  }
  const missing = result.filter((r) => !r.notes_landed).map((r) => r.brand);
  if (outJson) {
    console.log(JSON.stringify({ date: DAY, all_landed: missing.length === 0, missing_brands: missing, rows: result }, null, 2));
  } else {
    console.log(`单日落库检查 ${DAY}: ${missing.length ? '未齐 ' + missing.map((b) => NAMES[b]).join('/') : '✅ 五区笔记均已落'}`);
    for (const r of result) {
      console.log(`  ${r.brand}: 页面发布=${r.notes_published} 底表NOTE=${r.db_note_rows} NDS=${r.db_nds_rows} | 曝光=${r.summary?.exposure_sum ?? '-'} | 漏斗=${r.funnel ? `${r.funnel.inquiries}/${r.funnel.openings}/${r.funnel.leads}` : '-'} | 投流行=${r.db_campaign_rows} fee=${r.db_campaign_fee} | 线索行=${r.db_clue_rows}`);
    }
  }
  process.exit(missing.length ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
