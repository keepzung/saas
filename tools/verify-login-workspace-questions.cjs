/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 一次性验证（生产服务器跑）三个问题：
 * 1) 张宇/周翔 登录落在哪个工作区 —— GET /brand/myList（登录后工作区列表，单品牌直接落入）
 * 2) Perry 在奕境的用户管理是否还能看到 张宇/周翔
 * 3) Perry 在大众的用户管理是否能看到 张宇/周翔
 * 用法：node tools/verify-login-workspace-questions.cjs
 */
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { execSync } = require('child_process');
const fs = require('fs');

const ZHANGYU = { id: 204, phone: '18082035029' };
const ZHOUXIANG = { id: 205, phone: '15052454506' };
const PERRY = { id: 6, phone: '13375191664' };

const psql = (sql) =>
  execSync(`sudo -u postgres psql saas_prod -tAc ${JSON.stringify(sql)}`)
    .toString()
    .trim();

const get = async (token, path) => {
  const res = await fetch(`http://127.0.0.1:3000/api/agency-api${path}`, {
    headers: { token },
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`${path} http ${res.status}: ${JSON.stringify(body)}`);
  return body?.data ?? body;
};

async function main() {
  const pid = execSync('pm2 pid saas-api').toString().trim();
  const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
  const line = environ.split('\0').find((l) => l.startsWith('JWT_SECRET='));
  const secret = line ? line.slice('JWT_SECRET='.length).trim() : '';
  if (!secret) throw new Error('JWT_SECRET not found');
  const mint = (u, role, brandId) =>
    jwt.sign({ sub: u.id, phone: u.phone, role, ...(brandId ? { brandId } : {}) }, secret, {
      expiresIn: '10m',
    });

  // 双保险：DB 实际挂载
  for (const u of [ZHANGYU, ZHOUXIANG]) {
    const brands = psql(
      `SELECT string_agg(b.name, '、') FROM "BrandMember" bm JOIN "Brand" b ON b.id=bm."brandId" WHERE bm."userId"=${u.id}`,
    );
    console.log(`DB: ${u.phone} 挂载工作区 = ${brands}`);
  }

  // 问题1：张宇/周翔 登录工作区列表
  for (const u of [ZHANGYU, ZHOUXIANG]) {
    const my = await get(mint(u, 'SALES', 4), '/brand/myList');
    const list = (my?.list ?? []).map((b) => `${b.id}:${b.name}`);
    console.log(`Q1 ${u.phone} 登录后工作区列表 = [${list.join(', ')}] ${
      list.length === 1 && list[0].startsWith('4:') ? '=> 只进大众 PASS' : '=> 非单大众 FAIL'
    }`);
  }

  // 问题2/3：Perry 两个工作区的用户管理
  const perryToken = mint(PERRY, 'MANAGER', 7);
  const in7 = (await get(perryToken, '/user/manage/list?brandId=7'))?.list ?? [];
  const in4 = (await get(perryToken, '/user/manage/list?brandId=4'))?.list ?? [];
  const phones7 = new Set(in7.map((x) => x.phone));
  const phones4 = new Set(in4.map((x) => x.phone));
  const targets = [ZHANGYU.phone, ZHOUXIANG.phone];
  const leak7 = targets.filter((p) => phones7.has(p));
  const hit4 = targets.filter((p) => phones4.has(p));
  console.log(`Q2 Perry@奕境 列表 ${in7.length} 人，张宇/周翔出现: ${leak7.length ? `是 ${leak7} => FAIL` : '否 => PASS'}`);
  console.log(`Q3 Perry@大众 列表 ${in4.length} 人，张宇/周翔出现: ${hit4.length === 2 ? '是 => PASS' : `否(${hit4}) => FAIL`}`);

  const ok = leak7.length === 0 && hit4.length === 2;
  console.log(ok ? 'ALL PASS' : 'HAS FAILURES');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
