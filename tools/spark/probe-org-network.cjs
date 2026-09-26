// 韧性版：读页面 localStorage + 扫请求体，找 accountOrgCode（网络差也能出结果）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const TAG = process.env.TAG || 'tesla';
const STATE = path.join(__dirname, `state/auth-${TAG}.json`);
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const found = new Map();

function scan(text, src) {
  if (!text) return;
  const res = [];
  let m;
  const re1 = /accountOrgCode"?\s*[:=]\s*"?(\d{15,22})/g;
  while ((m = re1.exec(text))) res.push([m[1], 'accountOrgCode']);
  const re2 = /"orgCode"\s*:\s*"?(\d{15,22})/g;
  while ((m = re2.exec(text))) res.push([m[1], 'orgCode']);
  for (const [code, kind] of res) {
    if (!found.has(code)) {
      found.set(code, `${kind} @ ${src}`);
      console.log(`[hit] ${code}  (${kind})  <- ${src}`);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    viewport: { width: 1440, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.on('request', (req) => {
    if (/mcc\.xiaohongshu\.com/.test(req.url())) scan(req.postData(), 'req ' + req.url().slice(0, 90));
  });
  page.on('response', (res) => {
    if (/mcc\.xiaohongshu\.com\/api\//.test(res.url())) {
      res.text().then((t) => scan(t, 'res ' + res.url().slice(0, 90))).catch(() => {});
    }
  });

  for (const p of ['/micro/home', '/micro/aurora-data', '/micro/note-data']) {
    try {
      await page.goto(`https://mcc.xiaohongshu.com${p}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      console.log(`goto ${p} 失败: ${e.message.split('\n')[0]}`);
    }
    await page.waitForTimeout(7000);
    try {
      const ls = await page.evaluate(() => {
        const o = {};
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          o[k] = localStorage.getItem(k);
        }
        return JSON.stringify(o);
      });
      scan(ls, `localStorage@${p}`);
      const ss = await page.evaluate(() => {
        const o = {};
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          o[k] = sessionStorage.getItem(k);
        }
        return JSON.stringify(o);
      });
      scan(ss, `sessionStorage@${p}`);
    } catch (e) {
      console.log(`storage 读取失败@${p}: ${e.message.split('\n')[0]}`);
    }
    if (found.size) break;
  }
  console.log('===== 汇总 =====');
  for (const [code, src] of found) console.log(code, '<-', src);
  if (!found.size) console.log('（仍未捕获——需要人工在页面里点组织切换器看 URL/接口）');
  await browser.close().catch(() => {});
  process.exit(0);
})();
