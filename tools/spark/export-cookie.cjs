// 从 state/auth[ -TAG].json 提取 cookie 串（用于后端 SPARK_COOKIE / POST /spark/cookie）
// 用法: node export-cookie.cjs                # 默认账号 cookie
//       TAG=tesla node export-cookie.cjs      # 特斯拉账号 cookie（state/auth-tesla.json）
//       node export-cookie.cjs --env          # 打印 SPARK_COOKIE=... 单行（追加到 backend/.env）
//       TAG=tesla node export-cookie.cjs --brand 6 --api http://localhost:3000/api/agency-api
//                                             # 直推后端对应品牌组织（需先有 SparkOrgConfig 记录）
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || '').trim();
const stateFile = path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const argv = process.argv.slice(2);
if (argv.includes('--brand')) {
  const brandId = argv[argv.indexOf('--brand') + 1];
  const api = (argv.includes('--api') ? argv[argv.indexOf('--api') + 1] : 'http://localhost:3000/api/agency-api');
  fetch(`${api}/spark/cookie`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: process.env.ADMIN_TOKEN || '',
    },
    body: JSON.stringify({ cookie, brandId }),
  })
    .then((r) => r.json())
    .then((j) => console.log('API result:', JSON.stringify(j)))
    .catch((e) => {
      console.error('API push failed:', e.message);
      process.exit(1);
    });
} else if (process.argv.includes('--env')) {
  console.log(`SPARK_COOKIE=${cookie}`);
} else {
  console.log(cookie);
}
