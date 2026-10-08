#!/usr/bin/env node
// 探针：专业号「客户管理（旧版）」获客工具统计 API 抓取
// 用法: node probe-clue-old.cjs   （HEADLESS=0 人工辅助登录）
// 输出: tools/spark/state/pro-clue/old-apis.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state', 'pro-clue');
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(__dirname, 'state', 'auth-tesla2.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apis = [];
const bodies = [];

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
    if (/\/ads\/api\/|clue/i.test(u) && res.request().method() !== 'OPTIONS' && !/\.(js|css|png|svg|woff)/.test(u)) {
      let body = '';
      try { body = (await res.text()).slice(0, 4000); } catch {}
      apis.push({ m: res.request().method(), u: u.slice(0, 180), status: res.status(), post: res.request().postData()?.slice(0, 600) ?? '', res: body });
    }
  });

  console.log('[1] 打开专业号工作台 ...');
  await page.goto('https://pro.xiaohongshu.com/enterprise/home', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(6000);
  if (/login|passport/i.test(page.url())) {
    console.log('[!] 需要登录，请在浏览器中完成（最多 5 分钟）...');
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      if (!/login|passport/i.test(page.url())) break;
    }
  }

  // 顶部导航：线索经营 → 客户管理（旧版）
  console.log('[2] 当前URL:', page.url().slice(0, 100));
  for (const t of ['线索经营', '客户管理']) {
    const nav = page.locator(`text=${t}`).first();
    if (await nav.count().catch(() => 0)) {
      await nav.click({ timeout: 8000 }).catch((e) => console.log(`click ${t} fail:`, e.message.split('\n')[0]));
      await sleep(6000);
      console.log(`[nav] ${t} ->`, page.url().slice(0, 120));
    } else {
      console.log(`[nav] 未找到「${t}」`);
    }
  }

  // 子导航：依次点 用户列表 / 获客工具分析 / 首页，尽量触发获客工具统计 API
  for (const t of ['获客工具分析', '用户列表', '首页', '线索列表']) {
    const sub = page.locator(`text=${t}`).first();
    if (await sub.count().catch(() => 0)) {
      await sub.click({ timeout: 8000 }).catch(() => {});
      await sleep(7000);
      console.log(`[sub] ${t} ->`, page.url().slice(0, 120));
    }
  }
  // 回到带统计表的页面停一会儿，确保抓到
  await sleep(5000);

  fs.writeFileSync(path.join(OUT, 'old-apis.json'), JSON.stringify(apis, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT, 'old-landing.txt'), page.url() + '\n' + (await page.title()), 'utf8');
  await page.screenshot({ path: path.join(OUT, 'old-page.png') });
  console.log(`[done] 抓到 ${apis.length} 个 API -> state/pro-clue/old-apis.json`);
  console.log('[landing]', page.url().slice(0, 140));
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
