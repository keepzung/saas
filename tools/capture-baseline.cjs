#!/usr/bin/env node
// Phase 0 行为基线采集:对固定日期窗口抓关键只读接口,落盘 JSON 供架构整理期间 diff("改前=改后"的证明)。
// 窗口用固定日期(不含今天)→ 两次采集之间理论上逐字节一致,无需豁免当日漂移。
// 用法: node capture-baseline.cjs [--out=docs/arch-baseline] [--tag=before]
const fs = require('fs');
const path = require('path');
const jwt = require('../backend/node_modules/jsonwebtoken');
const env = fs.readFileSync(path.join(__dirname, '..', 'backend', '.env'), 'utf8');
const secret = (env.match(/JWT_SECRET="([^"]+)"/) || [])[1];
if (!secret) { console.error('JWT_SECRET 未找到'); process.exit(1); }

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const OUT = path.join(__dirname, '..', argOf('--out', 'docs/arch-baseline'));
const TAG = argOf('--tag', 'run');
const API = process.env.BASELINE_API || 'http://127.0.0.1:3000/api/agency-api';
const BRANDS = [2, 5, 6, 7, 8];
// 固定窗口(不含今天,两次采集间数据不再变化)
const WINDOWS = { w30: { start: '2026-10-15', end: '2026-11-23' }, w7: { start: '2026-11-17', end: '2026-11-23' } };
const ENDPOINTS = (w) => [
  [`overview-${w}`, `/kox/overview?brandId={b}&start=${WINDOWS[w].start}&end=${WINDOWS[w].end}`],
  [`notes-${w}`, `/kox/notes?brandId={b}&start=${WINDOWS[w].start}&end=${WINDOWS[w].end}&metric=views&page_size=10`],
  [`account-ranking-${w}`, `/kox/account-ranking?brandId={b}&start=${WINDOWS[w].start}&end=${WINDOWS[w].end}`],
];

const stable = (v) => JSON.stringify(sortify(v));
function sortify(v) {
  if (Array.isArray(v)) return v.map(sortify);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortify(v[k])]));
  }
  return v;
}

(async () => {
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, fail = 0;
  for (const b of BRANDS) {
    const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: b }, secret, { expiresIn: '30m' });
    for (const [w, ...eps] of Object.entries(WINDOWS).map(([w]) => [w])) {
      for (const [name, tpl] of ENDPOINTS(w)) {
        const url = `${API}${tpl.replace('{b}', b)}`;
        try {
          const res = await fetch(url, { headers: { token } });
          const j = await res.json().catch(() => ({ _nonjson: true }));
          const file = path.join(OUT, `b${b}-${name}-${TAG}.json`);
          fs.writeFileSync(file, stable({ http: res.status, body: j }));
          if (res.status === 200) ok++; else { fail++; console.log(`  ✗ b${b} ${name} http=${res.status}`); }
        } catch (e) {
          fail++;
          console.log(`  ✗ b${b} ${name}: ${e.message}`);
        }
      }
    }
  }
  console.log(`基线采集完成(tag=${TAG}): 成功 ${ok} · 失败 ${fail} → ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
