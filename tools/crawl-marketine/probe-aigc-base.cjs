// /aigc/* 基址探测：前端 axios baseURL 可能为 /api（同域 nginx）或 pyapi /api 前缀
const fs = require('fs');
const path = require('path');
const TOKEN = fs.readFileSync(path.join(__dirname, '.tokens', 'token-867.txt'), 'utf8').trim();

const BASES = [
  'https://saas.marketine.cn/api',
  'https://pyapi.gartech.cc/api',
  'https://saas.marketine.cn/api/agency-api',
];
const PATHS = [
  ['/aigc/materiallistnew', 'page=1&page_size=3'],
  ['/aigc/materialconfiglist', ''],
  ['/aigc/materialtemplatelist', ''],
];

(async () => {
  for (const b of BASES) {
    for (const [p, q] of PATHS) {
      try {
        const res = await fetch(`${b}${p}${q ? '?' + q : ''}`, { headers: { token: TOKEN } });
        const text = await res.text();
        console.log(`${b}${p} => ${res.status} ${text.slice(0, 200)}`);
      } catch (e) {
        console.log(`${b}${p} => ERR ${e.message}`);
      }
    }
    console.log('---');
  }
})();
