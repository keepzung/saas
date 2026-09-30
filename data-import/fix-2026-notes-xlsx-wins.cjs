const path = require('path');
const { createRequire } = require('module');
const R = createRequire(path.resolve('C:/Users/Ning/Desktop/马克听/saas/backend/noop.js'));
const F = createRequire(path.resolve('C:/Users/Ning/Desktop/马克听/saas/frontend/noop.js'));
const { PrismaClient } = R('@prisma/client');
const XLSX = F('xlsx');
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
(async () => {
  const wb = XLSX.readFile('C:/Users/Ning/Desktop/马克听/saas/tesla/特斯拉投放数据源.xlsx', { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['投放数据'], { defval: null });
  const cell = (v) => (v == null ? '' : String(v).trim());
  const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  const agg = new Map();
  for (const r of rows) {
    const nid = cell(r['笔记ID']); if (!nid) continue;
    const cur = agg.get(nid) ?? { imp: 0, click: 0, inq: 0, open: 0, leads: 0 };
    cur.imp += num(r['展现量']); cur.click += num(r['点击量']); cur.inq += num(r['私信进线数']); cur.open += num(r['私信开口数']); cur.leads += num(r['私信留资数']);
    agg.set(nid, cur);
  }
  const ids = [...agg.keys()];
  const db = await prisma.koxNote.findMany({ where: { brandId: 6, noteId: { in: ids } }, select: { id: true, noteId: true, exposure: true, views: true, pmInquiries: true, pmOpenings: true, pmLeads: true } });
  let fixed = 0;
  for (const n of db) {
    const xa = agg.get(n.noteId);
    const patch = {};
    if (xa.imp > n.exposure) patch.exposure = xa.imp;
    if (xa.click > n.views) patch.views = xa.click;
    if (xa.inq > n.pmInquiries) patch.pmInquiries = xa.inq;
    if (xa.open > n.pmOpenings) patch.pmOpenings = xa.open;
    if (xa.leads > n.pmLeads) patch.pmLeads = xa.leads;
    if (Object.keys(patch).length) {
      if (!DRY) await prisma.koxNote.update({ where: { id: n.id }, data: patch });
      fixed += 1;
    }
  }
  console.log((DRY ? '[dry] ' : '') + '字段级取大者修正（DB<xlsx 的矛盾值）: ' + fixed + ' 篇');
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
