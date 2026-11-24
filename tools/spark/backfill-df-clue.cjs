#!/usr/bin/env node
// 奕境(brand7) 线索两表历史回填：逐日触发 clue_analysis + clue_acq_tool 同步（MCC 线索口径，
// 运营总览漏斗 2026-11-24 切换后的数据源）。幂等可重跑；需 brand7 MCC cookie 有效（21:30 例程后跑）。
// 用法: node backfill-df-clue.cjs [--start=2026-09-20] [--end=YYYY-MM-DD] [--brand=7] [--delay=1200]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const jwt = backendRequire('jsonwebtoken');
const env = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8');
const m = env.match(/JWT_SECRET="([^"]+)"/);
if (!m) { console.error('JWT_SECRET 未找到'); process.exit(1); }
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const BRAND = Number(argOf('--brand', '7'));
const DELAY = Number(argOf('--delay', '1200'));
const dayStr = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const END = argOf('--end', dayStr(0));
const START = argOf('--start', dayStr(-90));

(async () => {
  const { PrismaClient } = backendRequire('@prisma/client');
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: BRAND }, m[1], { expiresIn: '8h' });
  const days = [];
  for (let t = new Date(`${START}T00:00:00+08:00`).getTime(); t <= new Date(`${END}T00:00:00+08:00`).getTime(); t += 864e5) {
    days.push(new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
  }
  console.log(`回填 brand${BRAND} 线索两表：${START} ~ ${END} 共 ${days.length} 天`);
  let okDays = 0, emptyDays = 0, fail = 0, acqRows = 0, anaRows = 0;
  for (const d of days) {
    let dayOk = true;
    for (const type of ['clue_analysis', 'clue_acq_tool']) {
      try {
        const res = await fetch('http://127.0.0.1:3000/api/agency-api/spark/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', token },
          body: JSON.stringify({ type, brandId: BRAND, date: d }),
        });
        const j = await res.json();
        const r = j?.data;
        if (!res.ok || (r && r.status && r.status !== 'success') || j?.code) {
          // clue_acq_tool 是 7 天窗滚动：单日空跑属正常；API 报错（如 cookie 过期）则终止
          const msg = j?.message || j?.msg || JSON.stringify(j).slice(0, 120);
          if (res.status === 401 || /cookie|登录/i.test(String(msg))) {
            console.error(`终止：${d} ${type} 会话失效 → ${msg}`);
            process.exit(2);
          }
          dayOk = false;
          console.log(`  ${d} ${type}: 异常 ${msg}`);
        } else if (r) {
          if (type === 'clue_analysis') { anaRows += r.upserted ?? 0; if ((r.fetched ?? 0) > 0) dayOk = dayOk && true; }
          else acqRows += r.upserted ?? 0;
        }
      } catch (e) {
        dayOk = false;
        console.log(`  ${d} ${type}: 请求失败 ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, DELAY));
    }
    if (dayOk) okDays++; else fail++;
    if ((days.indexOf(d) + 1) % 10 === 0) console.log(`  进度 ${days.indexOf(d) + 1}/${days.length} · 有效日 ${okDays} · 线索行 ${anaRows} · 获客行 ${acqRows}`);
  }
  console.log(`完成：${days.length} 天 · 有效 ${okDays} · 异常 ${fail} · clue_analysis 累计落库 ${anaRows} 行 · clue_acq_tool 累计落库 ${acqRows} 行`);
})().catch((e) => { console.error(e.message); process.exit(1); });
