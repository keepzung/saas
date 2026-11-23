/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 一次性验证（在生产服务器跑）：新建 SALES 账号默认模块 = 任务列表(117) + 任务详情(126)，不含派发新任务(118)。
 * 用法：node tools/verify-sales-default-modules.cjs
 * 结束后自动删除测试账号（BrandMember + User）。
 */
const jwt = require('/opt/saas/backend/node_modules/jsonwebtoken');
const { execSync } = require('child_process');
const fs = require('fs');

const PHONE = '19999990001';
const EXPECT = JSON.stringify([117, 126]);

const psql = (sql) =>
  execSync(`sudo -u postgres psql saas_prod -tAc ${JSON.stringify(sql)}`)
    .toString()
    .trim();

async function main() {
  // 以运行中进程的 environ 为准（.env 文件可能与 pm2 实际环境不一致）
  const pid = execSync('pm2 pid saas-api').toString().trim();
  const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
  const m = environ.split('\0').find((l) => l.startsWith('JWT_SECRET='));
  const secret = m ? m.slice('JWT_SECRET='.length).trim() : '';
  if (!secret) throw new Error('JWT_SECRET not found in saas-api environ');
  const adminId = Number(psql(`SELECT id FROM "User" WHERE role='ADMIN' ORDER BY id LIMIT 1`));
  const token = jwt.sign({ sub: adminId, phone: 'verify-bot', role: 'ADMIN' }, secret, {
    expiresIn: '10m',
  });

  const res = await fetch('http://127.0.0.1:3000/api/agency-api/user/manage', {
    method: 'POST',
    headers: { token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: PHONE,
      password: 'Test12345678',
      nickname: '__默认模块验证_可删',
      role: 'SALES',
      brandId: 7,
    }),
  });
  const body = await res.json();
  console.log('http status:', res.status);
  console.log('response:', JSON.stringify(body));

  const created = body?.data ?? body;
  const mods = (created?.moduleIds ?? []).slice().sort((a, b) => a - b);
  const pass = created?.adopted === false && JSON.stringify(mods) === EXPECT;
  console.log(
    `moduleIds = ${JSON.stringify(mods)} 期望 ${EXPECT}（不含 118 派发新任务）=> ${pass ? 'PASS' : 'FAIL'}`,
  );

  // 清理测试账号
  const del = psql(`DELETE FROM "BrandMember" WHERE "userId" IN (SELECT id FROM "User" WHERE phone='${PHONE}'); DELETE FROM "User" WHERE phone='${PHONE}';`);
  console.log('cleanup done', del ? '' : '');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  // 兜底清理，避免残留测试账号
  try {
    psql(
      `DELETE FROM "BrandMember" WHERE "userId" IN (SELECT id FROM "User" WHERE phone='${PHONE}'); DELETE FROM "User" WHERE phone='${PHONE}';`,
    );
    console.log('cleanup done (after error)');
  } catch (_) {}
  process.exit(1);
});
