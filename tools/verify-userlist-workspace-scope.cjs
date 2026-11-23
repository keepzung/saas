/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 一次性验证（在生产服务器跑）：用户管理列表按当前工作区过滤。
 * Perry(uid 6, MANAGER, 兼管 brand2/4/7)：
 *   ?brandId=7 → 只含奕境成员(119)，不含大众批次(肖肖/张宇等)
 *   ?brandId=4 → 含大众批次
 * 无 brandId → 兼容旧行为(多品牌并集)
 * 用法：node tools/verify-userlist-workspace-scope.cjs
 */
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { execSync } = require('child_process');
const fs = require('fs');

const PERRY_ID = 6;
const CHECK_PHONES = ['15221013391', '18082035029']; // 肖肖 / 张宇(批次)

const psql = (sql) =>
  execSync(`sudo -u postgres psql saas_prod -tAc ${JSON.stringify(sql)}`)
    .toString()
    .trim();

async function getList(token, brandId) {
  const url = `http://127.0.0.1:3000/api/agency-api/user/manage/list${brandId ? `?brandId=${brandId}` : ''}`;
  const res = await fetch(url, { headers: { token } });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`list http ${res.status}: ${JSON.stringify(body)}`);
  return body?.data?.list ?? [];
}

async function main() {
  const pid = execSync('pm2 pid saas-api').toString().trim();
  const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
  const line = environ.split('\0').find((l) => l.startsWith('JWT_SECRET='));
  const secret = line ? line.slice('JWT_SECRET='.length).trim() : '';
  if (!secret) throw new Error('JWT_SECRET not found in saas-api environ');
  const token = jwt.sign(
    { sub: PERRY_ID, phone: '13375191664', role: 'MANAGER', brandId: 7 },
    secret,
    { expiresIn: '10m' },
  );

  const inBrand7 = await getList(token, 7);
  const inBrand4 = await getList(token, 4);
  const union = await getList(token);

  const phones7 = new Set(inBrand7.map((u) => u.phone));
  const phones4 = new Set(inBrand4.map((u) => u.phone));

  const batchIn7 = CHECK_PHONES.filter((p) => phones7.has(p));
  const batchIn4 = CHECK_PHONES.filter((p) => phones4.has(p));

  console.log(`奕境(brandId=7) 列表人数: ${inBrand7.length} (期望 119)`);
  console.log(`大众(brandId=4) 列表人数: ${inBrand4.length}`);
  console.log(`无参(旧并集行为) 列表人数: ${union.length}`);
  console.log(`肖肖/张宇 在奕境列表: ${batchIn7.length ? `仍出现 ${batchIn7} => FAIL` : '不出现 => PASS'}`);
  console.log(`肖肖/张宇 在大众列表: ${batchIn4.length === CHECK_PHONES.length ? '出现 => PASS' : `缺失 ${batchIn4} => FAIL`}`);

  const ok =
    inBrand7.length === 119 &&
    batchIn7.length === 0 &&
    batchIn4.length === CHECK_PHONES.length;
  console.log(ok ? 'ALL PASS' : 'HAS FAILURES');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
