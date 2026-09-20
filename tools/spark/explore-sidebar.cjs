// dump 侧边栏完整 DOM（含 data-* 属性），定位每个菜单项的可点击元素
const { chromium } = require('playwright');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const NAV_URLS = {
  资产: 'https://mcc.xiaohongshu.com/micro/brand-manage',
  数据: 'https://mcc.xiaohongshu.com/micro/data-monitor?from=MENU',
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const nav = process.argv[2] || '资产';
  await page.goto(NAV_URLS[nav], { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  const sidebarHtml = await page.evaluate(() => {
    const siders = [...document.querySelectorAll('[class*=sider], [class*=Sider], aside, [class*=menu-wrapper], [class*=left-menu]')];
    const sider = siders.sort((a, b) => b.innerText.length - a.innerText.length)[0];
    if (!sider) return '(no sider found)';
    const walk = (el, depth) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = [];
      for (const child of el.children) {
        const cls = String(child.className || '').slice(0, 100);
        const attrs = [...child.attributes]
          .filter((a) => a.name.startsWith('data-') || ['title', 'path', 'to'].includes(a.name))
          .map((a) => `${a.name}=${a.value.slice(0, 60)}`)
          .join(' ');
        const ownText = [...child.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => norm(n.textContent))
          .join(' ')
          .slice(0, 30);
        out.push(`${'  '.repeat(depth)}<${child.tagName.toLowerCase()} ${cls ? 'cls=' + cls : ''} ${attrs} text="${ownText}">`);
        out.push(...walk(child, depth + 1));
      }
      return out;
    };
    return walk(sider, 0).join('\n').slice(0, 8000);
  });
  console.log(`===== SIDEBAR DOM (${nav}) =====`);
  console.log(sidebarHtml);

  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
