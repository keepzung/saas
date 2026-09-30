// 推送专业号登录态到后端（本地/生产）：TAG=tesla2 node push-pro-state.cjs [--api http://...]
// 先登录：TAG=tesla2 NO_PROXY=1 HEADLESS=0 node login.cjs → pro.xiaohongshu.com 登录一次（SSO 同步进 state）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TAG = (process.env.TAG || 'tesla2').trim();
const stateFile = path.join(__dirname, `state/auth-${TAG}.json`);
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

const argv = process.argv.slice(2);
const apiIdx = argv.indexOf('--api');
const API = apiIdx > -1 ? argv[apiIdx + 1] : 'http://localhost:3000/api/agency-api';
const BRAND = process.env.BRAND || '6';

(async () => {
  if (!fs.existsSync(stateFile)) {
    console.error(`缺少 ${stateFile}`);
    process.exit(1);
  }
  const loginRes = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER || '18600104701', password: sha1(process.env.ADMIN_PASS || 'yoyo0508'), main_company_id: BRAND }),
  });
  const lj = await loginRes.json();
  if (lj.code !== 100) { console.error('admin login fail', JSON.stringify(lj).slice(0, 150)); process.exit(1); }
  const token = lj.data.token;

  const res = await fetch(`${API}/pro/storage-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ brandId: BRAND, storageState: fs.readFileSync(stateFile, 'utf8') }),
  });
  console.log('push result:', JSON.stringify(await res.json()));
})();
