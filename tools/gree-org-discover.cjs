// 一次性只读：用格力 cookie 打开 MCC 后台，从网络请求/页面中抓取 orgCode
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }
function resolveChromium() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const base = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs)
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome'])
      if (fs.existsSync(path.join(base, d, sub))) return path.join(base, d, sub);
  return undefined;
}
for (const l of fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
(async () => {
  const { PrismaClient } = backendRequire('@prisma/client');
  const prisma = new PrismaClient();
  const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId: 8 } });
  await prisma.$disconnect();
  if (!cfg?.cookie) throw new Error('brand8 无 cookie');
  const browser = await chromium.launch({
    headless: false,
    executablePath: resolveChromium(),
    env: { ...process.env, DISPLAY: ':99' },
    args: ['--no-proxy-server', '--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'zh-CN', viewport: { width: 1440, height: 860 } });
  await ctx.addCookies(cfg.cookie.split('; ').map((pair) => {
    const eq = pair.indexOf('=');
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: '.xiaohongshu.com', path: '/' };
  }));
  const page = await ctx.newPage();
  const apiUrls = new Set();
  page.on('request', (req) => {
    const u = req.url();
    if (/api\/mcc|\/api\/vision|org/i.test(u)) apiUrls.add(u.slice(0, 160));
  });
  await page.goto('https://mcc.xiaohongshu.com/micro/aurora-data', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto warn:', String(e).slice(0, 80)));
  await new Promise((r) => setTimeout(r, 15000));
  const info = await page.evaluate(() => {
    const out = { url: location.href, localStorage: {}, htmlHints: [] };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = String(localStorage.getItem(k)).slice(0, 200);
      if (/org|account|1942|2065|\d{16,}/i.test(k + v)) out.localStorage[k] = v;
    }
    const m = document.documentElement.innerHTML.match(/\d{15,22}/g);
    if (m) out.htmlHints = [...new Set(m)].slice(0, 10);
    return out;
  });
  console.log('最终 URL:', info.url);
  console.log('localStorage 线索:', JSON.stringify(info.localStorage, null, 1).slice(0, 800));
  console.log('页面长数字:', info.htmlHints.join(', ') || '无');
  console.log('--- 网络请求 ---');
  for (const u of [...apiUrls].slice(0, 15)) console.log(' ', u);
  await browser.close();
})().catch((e) => { console.error('FAIL:', String(e).slice(0, 300)); process.exit(1); });
