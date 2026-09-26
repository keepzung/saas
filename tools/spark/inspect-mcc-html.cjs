// 检查 MCC home HTML 的资源结构
const fs = require('fs');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
(async () => {
  const r = await fetch('https://mcc.xiaohongshu.com/micro/home', { headers: { 'User-Agent': UA } });
  const t = await r.text();
  fs.writeFileSync(require('path').join(__dirname, 'state', 'mcc-home.html'), t);
  const scripts = [...t.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  console.log('script srcs:', JSON.stringify(scripts, null, 1));
  const urls = [...new Set([...t.matchAll(/"(\/[a-zA-Z0-9_\-/.]+\.js)"/g)].map((m) => m[1]))];
  console.log('js urls in html:', urls.slice(0, 20).join('\n'));
})();
