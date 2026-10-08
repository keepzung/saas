#!/usr/bin/env node
// 探针：新版线索经营 → 切换旧版 → 客户管理「获客工具统计」API 抓取
// 输出: tools/spark/state/pro-clue/old2-apis.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'pro-clue');
const STATE = path.join(__dirname, 'state', 'auth-tesla2.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const apis = [];

(async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1680, height: 1000 },
  });
  const page = await ctx.newPage();
  page.on('response', async (res) => {
    const u = res.url();
    const m = res.request().method();
    if (m === 'OPTIONS') return;
    // 放宽：抓所有 POST（pro 域内），旧版获客工具统计的接口路径未知
    if (m === 'POST' && /pro\.xiaohongshu\.com/.test(u) && !/\.js|\.css|\.png|\.svg|\.woff|graphql|track|buried/i.test(u)) {
      let body = '';
      try { body = (await res.text()).slice(0, 8000); } catch {}
      apis.push({ m, u: u.slice(0, 200), status: res.status(), post: res.request().postData()?.slice(0, 800) ?? '', res: body });
    }
  });

  console.log('[1] 打开新版线索经营 ...');
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/new-clue-management', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(6000);
  if (/login|passport/i.test(page.url())) {
    console.log('[!] 需要登录，请在浏览器完成（最多 5 分钟）');
    for (let i = 0; i < 60; i++) { await sleep(5000); if (!/login|passport/i.test(page.url())) break; }
  }

  console.log('[2] 关掉引导弹窗 → 点击「切换旧版」 ...');
  for (const t of ['跳过', '我知道了', '知道了']) {
    const x = page.locator(`text=${t}`).first();
    if (await x.count().catch(() => 0)) { await x.click({ timeout: 3000 }).catch(() => {}); await sleep(1200); }
  }
  for (let round = 1; round <= 3 && page.url().includes('new-clue-management'); round++) {
    console.log(`[2.${round}] 尝试点击「切换旧版」（第 ${round} 轮）...`);
    await sleep(4000);
    for (const t of ['跳过', '我知道了', '知道了']) {
      const x = page.locator(`text=${t}`).first();
      if (await x.count().catch(() => 0)) { await x.click({ timeout: 2000, force: true }).catch(() => {}); await sleep(800); }
    }
    const cands = page.locator(':text("切换旧版")');
    const n = await cands.count().catch(() => 0);
    console.log(`  命中 ${n} 个「切换旧版」元素`);
    if (!n) { await page.screenshot({ path: path.join(OUT, `old2-r${round}.png`) }); continue; }
    const info = await cands.first().evaluate((el) => el.outerHTML.slice(0, 200)).catch(() => 'n/a');
    console.log('  html:', info);
    const box = await cands.first().boundingBox().catch(() => null);
    // 点父级可点击元素（span 的父级才是按钮）
    const clicked = await cands
      .first()
      .evaluate((el) => {
        let n = el;
        for (let i = 0; i < 4 && n; i++) {
          n = n.parentElement;
          if (!n) break;
          const cur = n;
          if (cur.tagName === 'BUTTON' || (cur.getAttribute('class') || '').match(/btn|button|switch/i)) {
            cur.click();
            return `${cur.tagName}.${cur.getAttribute('class')}`;
          }
        }
        el.click();
        return 'self';
      })
      .catch(() => 'err');
    console.log('  点击目标:', clicked);
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {}); }
    await sleep(3000);
    // 确认弹层：「确认切回旧版？」→ 点「仍要切换回旧版」
    const still = page.locator('text=仍要切换回旧版').first();
    if (await still.count().catch(() => 0)) {
      await still.click({ timeout: 5000, force: true }).catch((e) => console.log('still fail:', e.message.split('\n')[0]));
      console.log('  已点「仍要切换回旧版」');
      await sleep(10000);
    }
    // 可能出现确认弹层
    const confirmTexts = ['确认', '确定', '切换', '仍要'];
    for (const t of confirmTexts) {
      const d = page.locator(`text=${t}`).first();
      const c = await d.count().catch(() => 0);
      if (c) {
        const txt = await d.evaluate((el) => el.outerHTML.slice(0, 150)).catch(() => '');
        console.log(`  [dialog?]「${t}」 x${c}:`, txt);
      }
    }
    const bodyTxt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)).catch(() => '');
    console.log('  [body]', bodyTxt.slice(0, 300));
    await sleep(9000);
    console.log('  当前URL:', page.url().slice(0, 110));
  }
  console.log('[landing]', page.url().slice(0, 140));
  console.log('[landing]', page.url().slice(0, 140));

  // 旧版子导航：重点停留 首页（获客工具统计表）与 获客工具分析，滚动触发懒加载
  for (const t of ['首页', '获客工具分析']) {
    const sub = page.locator(`text=${t}`).first();
    if (await sub.count().catch(() => 0)) {
      await sub.click({ timeout: 6000 }).catch(() => {});
      await sleep(8000);
      // 滚动到底触发懒加载，再回顶部
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await sleep(4000);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await sleep(3000);
      console.log(`[tab] ${t} ->`, page.url().slice(0, 120), `| apis=${apis.length}`);
    }
  }
  await sleep(4000);

  fs.writeFileSync(path.join(OUT, 'old2-apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, 'old2-page.png') });
  console.log(`[done] 抓到 ${apis.length} 个 API -> old2-apis.json`);
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
