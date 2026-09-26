// 抓 watch-dashboard 全部 vision 请求体，逐个 fetch 重放，找出可复用的数据接口
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'state');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(OUT, 'partner-tesla-state.json'),
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const bodies = new Map();
  page.on('request', (req) => {
    if (/\/api\/vision\//.test(req.url()) && req.method() === 'POST' && req.postData()) {
      const url = req.url();
      const key = url.split('/api/')[1];
      if (!bodies.has(key + '|' + req.postData().slice(0, 60))) {
        bodies.set(key + '|' + req.postData().slice(0, 60), { url, body: req.postData() });
      }
    }
  });
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(24000);
  await browser.close();

  console.log('捕获 vision 请求数:', bodies.size);
  const state = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-tesla-state.json'), 'utf8'));
  const ck = state.cookies
    .filter((c) => /xiaohongshu\.com/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const saved = [];
  let i = 0;
  for (const { url, body } of bodies.values()) {
    i += 1;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    const chart = parsed.chart ?? '';
    const view = (parsed.viewAlias ?? '').slice(0, 60);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: ck,
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Origin: 'https://partner.xiaohongshu.com',
          Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
        },
        body,
      });
      const j = await r.json().catch(() => ({}));
      const vo = j?.data?.detailListVo ?? {};
      const rows = vo.detailDataList ?? vo.detailVoList ?? [];
      console.log(
        `[${i}] ${url.split('/api/')[1]?.slice(0, 50)} chart=${chart.slice(0, 30)} view=${view} -> code=${j.code} total=${vo.total ?? '-'} rows=${rows.length}`,
      );
      if (rows.length) {
        saved.push({ url, body, chart, view });
        const row0 = rows[0];
        const pick = (row, code) => {
          const list = row.targetList ?? row.targetVos ?? [];
          const hit = list.find((t) => t.targetCode === code);
          return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
        };
        console.log('      首行:', JSON.stringify({
          seller: pick(row0, 'virtual_seller_name'),
          cost: pick(row0, 'cost') ?? pick(row0, 'rank_cost'),
          imp: pick(row0, 'imp_cnt'),
          click: pick(row0, 'click_cnt'),
        }));
      }
    } catch (e) {
      console.log(`[${i}] ERR ${e.message.slice(0, 60)}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'partner-vision-usable.json'), JSON.stringify(saved, null, 1));
  console.log('可用接口已存 partner-vision-usable.json:', saved.length, '个');
  process.exit(0);
})();
