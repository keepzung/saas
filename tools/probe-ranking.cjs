// 端到端验证账号表现分析发布数: node probe-ranking.cjs <brandId> <start> <end>
// 在服务器 /opt/saas/tools 下运行, 用真实 ADMIN 身份调 account-ranking API
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
  const url = `http://127.0.0.1:3000/api/agency-api/kox/account-ranking?brandId=${brandId}&start=${start}&end=${end}&page=1&pageSize=5`;
  const r = await fetch(url, { headers: { token } });
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    const d = j.data || {};
    const rows = d.rows || d.list || d.items || (Array.isArray(d) ? d : []);
    console.log('code=', j.code, 'dataKeys:', Array.isArray(d) ? '(数组)' : Object.keys(d).join(','));
    for (const x of rows.slice(0, 5)) {
      const keys = Object.keys(x);
      const pubKey = keys.find((k) => /itemcnt|item_cnt|publish|note/i.test(k));
      console.log(`[${x.nickname || x.accountName || x.name}] 发布=${x.itemCnt ?? x.item_cnt} (候选字段 ${pubKey}=${x[pubKey]})`);
    }
    if (!rows.length) console.log(t.slice(0, 600));
  } catch {
    console.log(t.slice(0, 800));
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
