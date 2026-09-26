// 抓 MCC 前端 bundle，grep 组织相关 API 端点
const fs = require('fs');
const path = require('path');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, 'state', 'mcc-js');
fs.mkdirSync(OUT, { recursive: true });

async function get(url, toFile) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (toFile) fs.writeFileSync(toFile, buf);
  return buf;
}

(async () => {
  const html = (await get('https://mcc.xiaohongshu.com/micro/home')).toString('utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)].map((m) => m[1]);
  console.log('entry js:', assets.join(', '));
  const queue = [...new Set(assets)];
  const seen = new Set();
  const orgEndpoints = new Map();
  let budget = 40;

  const scanText = (text, src) => {
    const re = /["'`](\/api\/[a-zA-Z0-9_\-/]*(?:org|Org|ORG)[a-zA-Z0-9_\-/]*)["'`]/g;
    let m;
    while ((m = re.exec(text))) {
      if (!orgEndpoints.has(m[1])) {
        orgEndpoints.set(m[1], src);
        console.log(`[endpoint] ${m[1]}  <- ${src}`);
      }
    }
    if (/accountOrgCode/.test(text) && !orgEndpoints.has('ACCOUNT_ORG_CODE_IN:' + src)) {
      orgEndpoints.set('ACCOUNT_ORG_CODE_IN:' + src, src);
      console.log(`[has accountOrgCode] ${src}`);
    }
    const chunkRe = /"([a-zA-Z0-9_\-]+\.js)"/g;
    while ((m = chunkRe.exec(text))) {
      if (budget > 0 && !seen.has(m[1])) queue.push(m[1]);
    }
  };

  while (queue.length && budget > 0) {
    const name = queue.shift();
    if (seen.has(name) || !name.endsWith('.js')) continue;
    seen.add(name);
    budget -= 1;
    try {
      const url = name.startsWith('http') ? name : `https://mcc.xiaohongshu.com${name}`;
      const buf = await get(url, path.join(OUT, name.replace(/[\\/]/g, '_')));
      scanText(buf.toString('utf8'), name);
    } catch (e) {
      console.log(`fetch fail ${name}: ${e.message.slice(0, 60)}`);
    }
  }
  console.log('===== 组织端点汇总 =====');
  for (const [ep, src] of orgEndpoints) console.log(ep, ' <- ', src);
})();
