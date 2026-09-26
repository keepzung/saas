// 下载 mcc-shell CDN JS 并 grep 组织端点
const fs = require('fs');
const path = require('path');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const base = 'https://fe-static.xhscdn.com/formula-static/mcc-shell/public/resource/js/';
const files = [
  'bundler-runtime.ebd35edf',
  'library-delight.02d9b177',
  'library-lodash.e68d9a94',
  'library-polyfill.c7796da3',
  'library-launcher.5ce53fde',
  'library-axios.bebdc245',
  'library-vue.363e161d',
  '640.2fbdf4d2',
  'index.275ebbc1',
];
const OUT = path.join(__dirname, 'state', 'mcc-js');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const chunkQueue = [];
  for (const f of files) {
    try {
      const r = await fetch(base + f + '.js', { headers: { 'User-Agent': UA } });
      const t = await r.text();
      fs.writeFileSync(path.join(OUT, f + '.js'), t);
      const hits = [];
      let m;
      const re = /["'](\/api\/[a-zA-Z0-9_\-/]*(?:org|Org)[a-zA-Z0-9_/-]*)["']/g;
      while ((m = re.exec(t))) hits.push(m[1]);
      const ao = (t.match(/accountOrgCode/g) || []).length;
      console.log(f.padEnd(32), Math.round(t.length / 1024) + 'KB', 'org端点:', [...new Set(hits)].join(', ') || '-', 'accountOrgCode x' + ao);
      const cr = /["']([a-zA-Z0-9_\-]+\.[a-f0-9]{8}\.js)["']/g;
      while ((m = cr.exec(t))) chunkQueue.push(m[1]);
    } catch (e) {
      console.log(f, 'FAIL', e.message.slice(0, 50));
    }
  }
  const uniqChunks = [...new Set(chunkQueue)];
  console.log('lazy chunks discovered:', uniqChunks.length);
  fs.writeFileSync(path.join(OUT, '_chunks.json'), JSON.stringify(uniqChunks));
})();
