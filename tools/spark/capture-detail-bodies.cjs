// 长等待捕获 dashboard 所有 target_detail_list 请求体（不做重放，只存盘分析）
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
  const bodies = [];
  page.on('request', (req) => {
    if (/target_detail_list|target_card|target_trend/.test(req.url()) && req.postData()) {
      bodies.push({ url: req.url().split('/api/')[1], body: req.postData() });
    }
  });
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  for (let t = 0; t < 8; t += 1) {
    await page.waitForTimeout(5000);
    const ready = await page.evaluate(() => document.body.innerText.includes('昨日复盘'));
    if (ready) {
      console.log(`[*] 昨日复盘已在第 ${(t + 1) * 5}s 渲染`);
      break;
    }
  }
  await page.waitForTimeout(8000);
  console.log('捕获请求数:', bodies.length);
  const uniq = new Map();
  for (const { url, body } of bodies) {
    try {
      const b = JSON.parse(body);
      const key = `${(b.viewAlias || '').slice(0, 55)}|${b.chart}|${b.reportCode ?? ''}`;
      if (!uniq.has(key)) uniq.set(key, { url, b });
    } catch {}
  }
  console.log('去重组合:', uniq.size);
  const arr = [];
  for (const [key, { url, b }] of uniq) {
    console.log('\n### ' + key);
    console.log('  viewAlias:', b.viewAlias);
    console.log('  chart:', b.chart, ' reportCode:', JSON.stringify(b.reportCode));
    console.log('  targets:', JSON.stringify(b.dynamicTargets ?? []).slice(0, 400));
    console.log('  filters:', JSON.stringify(b.frontFilterList ?? []).slice(0, 400));
    arr.push({ key, url, body: b });
  }
  fs.writeFileSync(path.join(OUT, 'partner-detail-bodies.json'), JSON.stringify(arr, null, 1));
  console.log('\n已存 partner-detail-bodies.json');
  await browser.close();
  process.exit(0);
})();
