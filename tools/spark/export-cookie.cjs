// 从 state/auth.json 提取 cookie 串（用于后端 .env 的 SPARK_COOKIE）
// 用法: node export-cookie.cjs          # 打印 cookie 串
//       node export-cookie.cjs --env    # 打印 SPARK_COOKIE=... 单行（追加到 backend/.env）
const fs = require('fs');
const path = require('path');

const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'state/auth.json'), 'utf8'));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

if (process.argv.includes('--env')) {
  console.log(`SPARK_COOKIE=${cookie}`);
} else {
  console.log(cookie);
}
