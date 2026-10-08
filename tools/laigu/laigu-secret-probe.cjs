#!/usr/bin/env node
// 来鼓 API 页：抓 app_key + app_secret（点击复制按钮后读剪贴板 / 或点眼睛显示明文）
const { chromium } = require('../spark/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'state');
const STATE = path.join(OUT, 'laigu-auth-laigu-tesla.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  const apiResp = [];
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && /meiqia\.cn/.test(res.url())) {
      let body = '';
      try { body = (await res.text()).slice(0, 3000); } catch {}
      apiResp.push({ u: res.url().slice(0, 150), res: body });
    }
  });

  await page.goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(7000);
  if (/login/i.test(page.url())) { console.error('登录态失效'); await browser.close(); process.exit(1); }

  // 枚举侧栏菜单链接
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => ({ t: (a.innerText || '').trim().slice(0, 16), h: a.getAttribute('href') || '' })).filter((x) => x.t),
  );
  console.log('[menu]', JSON.stringify(menu));

  // 依次尝试可能的 API 路由
  let onApi = false;
  const routes = ['/api', '/open', '/open-api', '/openapi', '/agent/api', '/setting/api', '/settings/api'];
  for (const r of routes) {
    await page.goto('https://pro.laigu.com' + r, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await sleep(4000);
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
    if (/app_secret/i.test(txt)) { onApi = true; console.log('[route ok]', r); break; }
  }
  // 路由试探失败 → 从侧栏菜单逐个点
  if (!onApi) {
    for (const m of menu) {
      if (!m.h || m.h === '#') continue;
      if (/api|open/i.test(m.h + m.t)) {
        await page.goto('https://pro.laigu.com' + m.h, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await sleep(4000);
        const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
        console.log('[menu try]', m.h, 'app_secret?', /app_secret/i.test(txt));
        if (/app_secret/i.test(txt)) { onApi = true; break; }
      }
    }
  }
  if (!onApi) { console.log('未找到 API 页'); await page.screenshot({ path: path.join(OUT, 'laigu-dash2.png') }); await browser.close(); process.exit(1); }

  // 读 app_key 行与 app_secret 行
  const readRow = async (label) =>
    page.evaluate((label) => {
      const txt = document.body.innerText;
      const m = txt.match(new RegExp(label + `\\s*\\n\\s*([^\\n]+)`));
      return m ? m[1].trim() : '';
    }, label);
  let appKey = await readRow('app_key');
  let appSecret = await readRow('app_secret');
  console.log('[row] app_key:', appKey, '| app_secret(初始):', appSecret ? appSecret.slice(0, 6) + '...' : '(空)');

  // 点 app_secret 的眼睛/复制：定位 app_secret 文本所在容器内的图标按钮
  const node = page.locator('text=app_secret').first();
  if (await node.count().catch(() => 0)) {
    const box = await node.boundingBox().catch(() => null);
    if (box) {
      // 同一水平线右侧的图标逐个点击（眼睛→显示；复制→进剪贴板）
      const btns = page.locator('button, [role=button], svg[class*=icon], [class*=icon]');
      const n = await btns.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const b = await btns.nth(i).boundingBox().catch(() => null);
        if (!b) continue;
        if (Math.abs(b.y - box.y) < 14 && b.x > box.x) {
          await btns.nth(i).click({ timeout: 2000, force: true }).catch(() => {});
          await sleep(700);
          const t2 = await readRow('app_secret');
          if (t2 && t2 !== appSecret && !/\*/.test(t2)) { appSecret = t2; console.log('[reveal by icon', i + ']', t2.slice(0, 6) + '...'); break; }
          // 复制按钮：读剪贴板
          const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
          if (clip && clip.length >= 16 && !/\*/.test(clip) && clip !== appKey) { appSecret = clip; console.log('[clipboard by icon', i + ']', clip.slice(0, 6) + '...'); break; }
        }
      }
    }
  }
  console.log('[final] app_key:', appKey, '| app_secret:', appSecret ? `len=${appSecret.length}` : '(空)');
  fs.writeFileSync(path.join(OUT, 'laigu-appkey-secret.json'), JSON.stringify({ appKey, appSecret, capturedAt: new Date().toISOString() }, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT, 'laigu-api-page.txt'), await page.evaluate(() => document.body.innerText).catch(() => ''), 'utf8');
  fs.writeFileSync(path.join(OUT, 'laigu-api-resp.json'), JSON.stringify(apiResp, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, 'laigu-api-final.png') });
  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
