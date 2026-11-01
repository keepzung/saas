// 验证投流总览总览卡口径: node probe-campaign-summary.cjs <start> <end>
const fs = require('fs');
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { PrismaClient } = require('/opt/saas/backend/node_modules/@prisma/client');
const p = new PrismaClient();
const [, , start, end] = process.argv;
(async () => {
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const m = fs.readFileSync('/opt/saas/backend/.env', 'utf8').match(/JWT_SECRET="([^"]+)"/);
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: 6 }, m[1], { expiresIn: '5m' });
  const url = `http://127.0.0.1:3000/api/agency-api/spark/campaign/summary?brandId=6&start=${start}&end=${end}`;
  const j = await (await fetch(url, { headers: { token } })).json();
  const d = j.data || {};
  const s = d.summary || {};
  console.log('code=', j.code, 'metric_note=', (d.metric_note || '').slice(0, 60));
  console.log(`总消耗=${s.fee}  总私信留资=${s.msg_leads}  留资成本=${s.msg_lead_cost}  曝光=${s.impression}  投流内容数=${s.promo_note_cnt}`);
  const trend = d.trend || [];
  for (const t of trend.slice(-8)) console.log(`${t.date}  fee=${t.fee}  进线=${t.msg_inquiries}  留资=${t.msg_leads}`);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
