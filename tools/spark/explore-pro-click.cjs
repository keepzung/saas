// 专业号平台：按菜单文本点击遍历板块并捕获 API
// 用法: TAG=tesla2 NO_PROXY=1 node explore-pro-click.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const OUT = path.join(__dirname, `state/pro-click-${TAG}.json`);
const MENUS = process.env.MENUS
  ? process.env.MENUS.split(',')
  : ['内容管理', '数据中心', '营销工具', '平台操作日志', '商业推广'];
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, `state/auth-${TAG}.json`),
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  let apis = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('xiaohongshu.com')) return;
      if (!/\/api\/|gateway|edith|eros|proaccount|lead|galaxy/.test(url)) return;
      if (/spider-tracker|apm-fe|sec\/v1|collect|abtest|robin|help_cs/.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = (await res.text().catch(() => '')).slice(0, 1500);
      apis.push({ url: url.slice(0, 170), method: res.request().method(), status: res.status(), body });
    } catch { /* ignore */ }
  });

  const gotoRetry = async (url, wait = 9000) => {
    for (let i = 1; i <= 3; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        break;
      } catch (e) {
        console.log(`  [goto retry ${i}] ${e.message.split('\n')[0]}`);
        await page.waitForTimeout(3000);
      }
    }
    await page.waitForTimeout(wait);
  };

  await gotoRetry('https://pro.xiaohongshu.com/enterprise/home', 7000);
  const report = [];
  for (const m of MENUS) {
    const before = apis.length;
    let clicked = false;
    try {
      // 顶级菜单
      const top = page.locator(`text=${m}`).first();
      if (await top.count()) {
        await top.click({ timeout: 5000 });
        clicked = true;
        await page.waitForTimeout(6000);
      }
    } catch (e) {
      console.log(`[click fail] ${m}: ${e.message.split('\n')[0]}`);
    }
    const url = page.url();
    // 二级菜单快照
    const sub = await page
      .evaluate(() =>
        [...document.querySelectorAll('[class*=menu] li, [class*=Menu] li, [class*=nav] [class*=item], [class*=side] [class*=item]')]
          .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t && t.length < 16)
          .slice(0, 25),
      )
      .catch(() => []);
    const text = await page
      .evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 900))
      .catch(() => '');
    report.push({ menu: m, url, clicked, subMenus: sub, text: text.slice(0, 700), newApis: apis.slice(before) });
    console.log(`\n[${m}] url=${url}\n  二级菜单: ${JSON.stringify(sub)}\n  新增API: ${apis.length - before}\n  文本: ${text.slice(0, 260)}`);
    // 二级菜单再点一层（数据中心/内容管理等）
    for (const s of sub.slice(0, 12)) {
      try {
        const el = page.locator(`text=${s}`).first();
        if (await el.count()) {
          const b2 = apis.length;
          await el.click({ timeout: 3000 });
          await page.waitForTimeout(5000);
          const u2 = page.url();
          if (u2 !== url || apis.length > b2) {
            const t2 = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500)).catch(() => '');
            report.push({ menu: `${m}/${s}`, url: u2, text: t2.slice(0, 500), newApis: apis.slice(b2) });
            console.log(`  [${m}/${s}] url=${u2} +${apis.length - b2} api`);
          }
        }
      } catch { /* ignore */ }
    }
  }

  const uniq = apis.filter((a, i, arr) => arr.findIndex((x) => x.url === a.url && x.method === a.method && x.body === a.body) === i);
  fs.writeFileSync(OUT, JSON.stringify({ report, apis: uniq }, null, 1));
  console.log(`\n[done] API ${uniq.length} 个 → ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
