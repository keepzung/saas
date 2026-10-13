#!/usr/bin/env node
// 东风矩阵号头像回填：用 1012 清单的真实 UID 构造用户主页，xhs web 登录态访问抓头像
// 数据: /tmp/bind-data.json (phone/uid/nickname)；登录态: tools/spark/state/auth-tesla2.json
// 成功后更新 KosAccount.avatar 并把 authorId 修正为真实 UID
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
function resolveChromium() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  try {
    const base = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const pp = path.join(base, d, sub);
        if (fs.existsSync(pp)) return pp;
      }
    }
  } catch {}
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = JSON.parse(fs.readFileSync('/tmp/bind-data.json', 'utf8').replace(/^\uFEFF/, ''));
  // 映射清单行 → kos 账号（经 user）
  const targets = [];
  for (const row of list) {
    const user = await p.user.findUnique({ where: { phone: row.phone }, select: { id: true } });
    if (!user) continue;
    const kos = await p.kosAccount.findFirst({ where: { brandId: 7, userId: user.id }, select: { id: true, nickname: true, avatar: true } });
    if (!kos || kos.avatar) continue; // 已有头像的跳过
    targets.push({ kosId: kos.id, nickname: kos.nickname, uid: row.uid, userId: user.id });
  }
  console.log(`待抓取账号: ${targets.length}`);
  if (!targets.length) { await p.$disconnect(); return; }

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromium(),
    args: ['--no-proxy-server', '--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1280, height: 800 } });
  const stateFile = process.env.STATE_FILE || '/opt/saas/tools/spark/state/auth-tesla2.json';
  if (fs.existsSync(stateFile)) {
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    await ctx.addCookies((st.cookies ?? []).map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
  } else {
    console.log('警告: 登录态文件不存在，将全部跳登录');
  }
  const page = await ctx.newPage();
  let hit = 0, skipLogin = 0, miss = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const res = await page.goto(`https://www.xiaohongshu.com/user/profile/${t.uid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      if (/login|passport/i.test(page.url())) {
        skipLogin++;
        console.log(`SKIP [${i + 1}] ${t.nickname}（登录态失效）`);
        if (skipLogin >= 3) { console.log('连续跳登录，中止'); break; }
        continue;
      }
      const avatar = await page.evaluate(() => {
        const img = document.querySelector('img.user-image, img.author-avatar, .user-avatar img, .avatar img, .user-image img');
        return img?.src ?? null;
      });
      if (avatar && /sns-avatar|sns-img|http/.test(avatar)) {
        await p.kosAccount.update({ where: { id: t.kosId }, data: { avatar, authorId: t.uid } });
        hit++;
        console.log(`OK  [${i + 1}] ${t.nickname} -> ${avatar.slice(0, 70)}`);
      } else {
        miss++;
        console.log(`MISS [${i + 1}] ${t.nickname} (${page.url().slice(0, 55)})`);
      }
    } catch (e) {
      miss++;
      console.log(`ERR [${i + 1}] ${t.nickname}: ${String(e).slice(0, 70)}`);
    }
    await sleep(1500 + Math.floor(Math.random() * 1200));
  }
  const total = await p.kosAccount.count({ where: { brandId: 7, avatar: { not: null, notIn: [''] } } });
  console.log(`DONE: 抓到 ${hit} | MISS ${miss} | 跳登录 ${skipLogin} | brand7 有头像 ${total}/100`);
  await browser.close();
  await p.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
