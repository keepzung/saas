// 端到端查看运营总览 trend 的投放三线: node probe-overview.cjs <brandId> <start> <end>
const fs = require('fs');
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { PrismaClient } = require('/opt/saas/backend/node_modules/@prisma/client');
const p = new PrismaClient();
const [, , brandId = '6', start, end] = process.argv;
(async () => {
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const m = fs.readFileSync('/opt/saas/backend/.env', 'utf8').match(/JWT_SECRET="([^"]+)"/);
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: Number(brandId) }, m[1], { expiresIn: '5m' });
  const url = `http://127.0.0.1:3000/api/agency-api/kox/overview?brandId=${brandId}&start=${start}&end=${end}`;
  const r = await fetch(url, { headers: { token } });
  const j = await r.json();
  const d = j.data || {};
  const trend = d.trend || [];
  console.log('code=', j.code, 'trend天数=', trend.length);
  for (const t of trend) {
    console.log(
      `${t.date}  消耗=${t.ad_cost}  曝光=${t.ad_impression}  点击=${t.ad_click}  发布=${t.item_cnt}`,
    );
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
