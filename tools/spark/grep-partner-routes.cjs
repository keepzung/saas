// 抓 partner 平台前端 bundle，grep 路由表（数据中心/效果广告/报表/笔记相关路由）
const fs = require('fs');
const path = require('path');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, 'state', 'partner-shell-js');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const r0 = await fetch('https://partner.xiaohongshu.com/partner/subAccount-list', { headers: { 'User-Agent': UA } });
  const html = await r0.text();
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  console.log('entry scripts:', scripts.join('\n  '));

  const seen = new Set();
  const queue = [...scripts];
  const routeHits = new Map();
  let budget = 25;

  const scan = (text, src) => {
    // 路由定义：path/Route 字符串
    const re = /["'](\/partner\/[a-zA-Z0-9\-_/]+)["']/g;
    let m;
    while ((m = re.exec(text))) {
      const p = m[1];
      if (!routeHits.has(p)) {
        routeHits.set(p, src);
      }
    }
    const cr = /["']([a-zA-Z0-9_\-]+\.[a-f0-9]{8}\.js)["']/g;
    while ((m = cr.exec(text))) {
      if (budget > 0 && !seen.has(m[1])) queue.push(`https://partner.xiaohongshu.com/assets/js/${m[1]}`);
    }
  };

  while (queue.length && budget > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    budget -= 1;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const t = await r.text();
      fs.writeFileSync(path.join(OUT, 'js_' + (url.split('/').pop() || 'x') + '.js'), t);
      scan(t, url.split('/').pop());
      console.log('scanned', url.split('/').pop(), Math.round(t.length / 1024) + 'KB');
    } catch (e) {
      console.log('fail', url.slice(0, 60), e.message.slice(0, 40));
    }
  }

  console.log('\n===== /partner/ 路由清单 =====');
  const sorted = [...routeHits.keys()].sort();
  for (const p of sorted) console.log(p, ' <-', routeHits.get(p).split('/').pop());
})();
