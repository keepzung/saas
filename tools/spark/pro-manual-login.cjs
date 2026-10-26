// 一次性: 手动登录专业号 → 抓 storageState (用于刷新 ProOrgConfig)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'state', 'auth-pro-manual.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 900 } });
  const page = ctx.pages()[0] || (await ctx.newPage());
  console.log('[pro] 打开 pro.xiaohongshu.com ... 请在窗口中登录 (扫码或账密)');
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  let ok = false;
  for (let i = 0; i < 200; i++) {
    await sleep(3000);
    const url = page.url();
    if (!/login|signin|passport/i.test(url) && /enterprise|pro\.xiaohongshu\.com/.test(url)) {
      // 双重确认: 页面已有企业数据上下文
      const hasCk = (await ctx.cookies()).some((c) => /xiaohongshu\.com$/.test(c.domain) && /session|sid/i.test(c.name));
      if (hasCk) {
        ok = true;
        break;
      }
    }
    if (i % 20 === 19) console.log(`[pro] 等待登录... (${(i + 1) * 3}s) url=${url.slice(0, 60)}`);
  }
  if (!ok) {
    console.error('[pro] 10 分钟未检测到登录成功');
    await browser.close();
    process.exit(2);
  }
  await sleep(4000);
  const state = await ctx.storageState();
  fs.writeFileSync(OUT, JSON.stringify(state));
  console.log('[pro] storageState 已保存:', OUT, `(${(await ctx.cookies()).length} cookies)`);
  await browser.close();
  process.exit(0);
})();
