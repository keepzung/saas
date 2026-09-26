// 抓 watch-dashboard 的 target_detail_list 请求体并重放验证（fetch + cookie）
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
  let captured = null;
  page.on('request', (req) => {
    if (/\/api\/vision\/dashboard\/target_detail_list/.test(req.url()) && !captured) {
      captured = { url: req.url(), body: req.postData() };
    }
  });
  await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(22000);
  if (!captured) {
    console.log('未捕获到 target_detail_list 请求');
    await browser.close();
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT, 'partner-dashboard-req.json'), captured.body);
  console.log('[*] 请求体已存，长度', captured.body.length);

  // 用 cookie 直接 fetch 重放（无浏览器）
  const state = JSON.parse(fs.readFileSync(path.join(OUT, 'partner-tesla-state.json'), 'utf8'));
  const ck = state.cookies
    .filter((c) => /xiaohongshu\.com/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const r = await fetch(captured.url, {
    method: 'POST',
    headers: { Cookie: ck, 'Content-Type': 'application/json', 'User-Agent': UA, Origin: 'https://partner.xiaohongshu.com', Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard' },
    body: captured.body,
  });
  const j = await r.json().catch(() => ({}));
  const vo = j?.data?.detailListVo ?? {};
  const rows = vo.detailDataList ?? vo.detailVoList ?? [];
  console.log('[fetch 重放]', r.status, 'code=' + j.code, 'total=', vo.total, 'rows=', rows.length);
  const pick = (row, code) => {
    const list = row.targetList ?? row.targetVos ?? [];
    const hit = list.find((t) => t.targetCode === code);
    return hit?.targetValue ?? hit?.targetOriginValue ?? row[code];
  };
  for (const row of rows.slice(0, 6)) {
    console.log('  ', JSON.stringify({
      name: pick(row, 'virtual_seller_name'),
      cost: pick(row, 'cost'),
      imp: pick(row, 'imp_cnt'),
      click: pick(row, 'click_cnt'),
      msgLeads: pick(row, 'msg_leads_num') ?? pick(row, 'private_msg_leads_num'),
    }));
  }
  await browser.close();
  process.exit(0);
})();
