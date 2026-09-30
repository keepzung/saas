// 抓鉴权头 + 评论接口完整响应 + 设置API响应（找 app_secret）
// 用法: TAG=laigu-tesla NO_PROXY=1 node probe-laigu-auth.cjs
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'laigu-tesla').trim();
const STATE = path.join(__dirname, 'state', `laigu-state-${TAG}.json`);
const OUT = path.join(__dirname, 'state', `laigu-auth-${TAG}.json`);
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const captured = { authHeaders: null, tokenSample: null, commentRes: null, settingsRes: [], lsKeys: null };

  page.on('request', async (req) => {
    const url = req.url();
    if (/comment\/list|meiqia\.cn\/(spectrum|api)/.test(url)) {
      try {
        const h = await req.allHeaders();
        captured.authHeaders = { url: url.slice(0, 140), headers: h };
      } catch { /* ignore */ }
    }
  });
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (/comment\/list/.test(url)) {
        captured.commentRes = { url: url.slice(0, 140), body: (await res.text().catch(() => '')).slice(0, 4000) };
      }
      if (/api\/key|app_?key|secret|openapi/i.test(url) && res.request().method() === 'GET') {
        captured.settingsRes.push({ url: url.slice(0, 140), body: (await res.text().catch(() => '')).slice(0, 1500) });
      }
    } catch { /* ignore */ }
  });

  for (let i = 1; i <= 3; i++) {
    try { await page.goto('https://pro.laigu.com/comment', { waitUntil: 'domcontentloaded', timeout: 45000 }); break; }
    catch { await page.waitForTimeout(3000); }
  }
  await page.waitForTimeout(9000);

  captured.lsKeys = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) ?? '';
      out[k] = v.length > 80 ? v.slice(0, 60) + `...(len ${v.length})` : v;
    }
    return out;
  }).catch(() => null);

  // 设置→API 页
  try {
    await page.locator('text=设置').first().click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    await page.locator('text=API').first().click({ timeout: 4000 });
    await page.waitForTimeout(4000);
    const t = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' '));
    captured.settingsPageText = t.slice(0, 600);
  } catch (e) { console.log('设置页 fail:', e.message.split('\n')[0]); }

  fs.writeFileSync(OUT, JSON.stringify(captured, null, 1));
  console.log('authHeaders:', JSON.stringify(captured.authHeaders, null, 1)?.slice(0, 700));
  console.log('\ncommentRes:', (captured.commentRes?.body ?? 'null').slice(0, 800));
  console.log('\nsettingsRes:', JSON.stringify(captured.settingsRes, null, 1)?.slice(0, 900));
  console.log('\nlocalStorage keys:', JSON.stringify(captured.lsKeys, null, 1)?.slice(0, 600));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
