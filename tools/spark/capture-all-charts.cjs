// 抓 dashboard 全部 target_detail_list 请求体（长等待+滚动触发），列出 chart/view 差异
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
    if (/target_detail_list/.test(req.url()) && req.postData()) {
      try {
        const b = JSON.parse(req.postData());
        const key = `${(b.viewAlias || '').slice(0, 50)}|${b.chart}`;
        if (!bodies.has(key)) bodies.set(key, b);
      } catch {}
    }
  });
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(30000);
  // 滚动触发懒加载
  for (let s = 0; s < 8; s += 1) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(5000);
  await browser.close();

  console.log('捕获不同 view|chart 组合:', bodies.size);
  const state = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-tesla-state.json'), 'utf8'));
  const ck = state.cookies
    .filter((c) => /xiaohongshu\.com/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const all = [];
  for (const [key, b] of bodies) {
    console.log('\n=== ' + key + ' ===');
    console.log('  targets:', JSON.stringify(b.dynamicTargets ?? []).slice(0, 220));
    try {
      const r = await fetch('https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list', {
        method: 'POST',
        headers: {
          Cookie: ck,
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Origin: 'https://partner.xiaohongshu.com',
          Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
        },
        body: JSON.stringify(b),
      });
      const j = await r.json().catch(() => ({}));
      const vo = j?.data?.detailListVo ?? {};
      const rows = vo.detailDataList ?? vo.detailVoList ?? [];
      console.log('  重放: code=' + j.code, 'rows=' + rows.length);
      const pick = (row, code) => {
        const list = row.targetList ?? row.targetVos ?? [];
        const hit = list.find((t) => t.targetCode === code);
        return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
      };
      for (const row of rows.slice(0, 3)) {
        console.log('    ', JSON.stringify({
          seller: pick(row, 'virtual_seller_name'),
          cost: pick(row, 'cost') ?? pick(row, 'rank_cost') ?? pick(row, 'yesterday_cost'),
          imp: pick(row, 'imp_cnt'),
        }));
      }
      all.push({ key, body: b, rows: rows.slice(0, 3) });
    } catch (e) {
      console.log('  重放失败:', e.message.slice(0, 60));
    }
  }
  fs.writeFileSync(path.join(OUT, 'partner-all-charts.json'), JSON.stringify(all, null, 1));
  console.log('\n已存 partner-all-charts.json');
  process.exit(0);
})();
