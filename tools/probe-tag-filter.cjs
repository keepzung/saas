// 一次性探针：验证内容表现分析「账号标签」多选筛选（/kox/notes accountTag 参数）
const fs = require('fs');
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { PrismaClient } = require('/opt/saas/backend/node_modules/@prisma/client');
const p = new PrismaClient();
(async () => {
  const env = fs.readFileSync('/opt/saas/backend/.env', 'utf8');
  const m = env.match(/JWT_SECRET="([^"]+)"/);
  const u = await p.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await p.$disconnect();
  const t = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: 6 }, m[1], { expiresIn: '10m' });
  const H = { headers: { token: t } };
  const B = 'http://127.0.0.1:3000/api/agency-api';
  const acc = await (await fetch(B + '/kox/accounts?brandId=6&page_size=1', H)).json();
  console.log('tag_facets =', JSON.stringify(acc.data?.tag_facets ?? acc.tag_facets));
  const base = 'brandId=6&start=2026-10-01&end=2026-11-03&page_size=1';
  const a = await (await fetch(B + '/kox/notes?' + base, H)).json();
  const b = await (await fetch(B + '/kox/notes?' + base + '&accountTag=' + encodeURIComponent('全托管,全国高潜'), H)).json();
  console.log('无标签 total =', a.data?.total ?? a.total, '| 全托管+全国高潜 total =', b.data?.total ?? b.total);
  const s = await (await fetch(B + '/kox/notes/summary?' + base + '&accountTag=' + encodeURIComponent('全托管'), H)).json();
  console.log('summary(全托管) note_cnt =', s.data?.totals?.note_cnt ?? s.totals?.note_cnt);
})().catch((e) => { console.error(e.message); process.exit(1); });
