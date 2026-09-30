// 封面抓取诊断：检查登录态 + 单篇页面结构
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(__dirname, 'package.json'));
const { chromium } = sparkRequire('playwright');

const STATE = path.join(__dirname, 'state', 'xhs-web-tesla.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: UA, locale: 'zh-CN', viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  // 1) 登录态检查
  await page.goto('https://www.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const login = await page.evaluate(() => {
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch {}
    const loginBtn = !!document.querySelector('.login-btn, [class*="login-btn"], [class*="loginBtn"]');
    return { hasUser: !!(user && (user.userId || user.id || user.nickname)), nickname: user && (user.nickname || user.userId || ''), loginBtn };
  });
  console.log('[1] 登录态:', JSON.stringify(login));

  // 2) 单篇页结构（裸 explore 链接，无 xsec_token）
  const NOTE = process.env.NOTE_ID || '695c7cfb000000002200acc0';
  await page.goto(`https://www.xiaohongshu.com/explore/${NOTE}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));
  const diag = await page.evaluate(() => {
    const st = window.__INITIAL_STATE__;
    const out = { url: location.href, title: document.title.slice(0, 60), hasState: !!st, stateKeys: st ? Object.keys(st).slice(0, 15) : null };
    if (st && st.noteDetailMap) {
      const k = Object.keys(st.noteDetailMap);
      out.mapKeys = k.slice(0, 3);
      const first = k.length ? st.noteDetailMap[k[0]] : null;
      if (first) {
        const note = first.note || first;
        out.noteFields = Object.keys(note).slice(0, 25);
        out.imageListLen = note.imageList ? note.imageList.length : null;
        out.firstImg = note.imageList && note.imageList[0] ? (note.imageList[0].urlDefault || note.imageList[0].urlPre || '').slice(0, 90) : null;
        out.noteTitle = (note.title || '').slice(0, 40);
      }
    } else {
      out.bodySnippet = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200);
      const og = document.querySelector('meta[property="og:image"]');
      out.og = og ? og.content.slice(0, 90) : null;
    }
    return out;
  });
  console.log('[2] 页面诊断:', JSON.stringify(diag, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
