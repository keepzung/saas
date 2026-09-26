// 枚举 MCC 账号可见的组织（多组织配置需要每个组织的 orgCode）
// 用法: node list-orgs.cjs           # 默认账号（state/auth.json）
//       TAG=tesla node list-orgs.cjs # 特斯拉账号（state/auth-tesla.json）
// 原理：加载登录态打开 MCC，监听全部 /api/ 响应，筛出含 org 结构的报文并尝试常见组织列表端点
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.env.TAG || '').trim();
const STATE_FILE = path.join(__dirname, TAG ? `state/auth-${TAG}.json` : 'state/auth.json');

const looksLikeOrg = (o) =>
  o && typeof o === 'object' &&
  (o.accountOrgCode || o.orgCode || o.org_code || o.account_org_code);

const collectOrgs = (value, hits, source) => {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) collectOrgs(v, hits, source);
    return;
  }
  if (typeof value !== 'object') return;
  if (looksLikeOrg(value)) {
    hits.push({
      source,
      orgCode: value.accountOrgCode ?? value.orgCode ?? value.org_code ?? value.account_org_code,
      name: value.accountOrgName ?? value.orgName ?? value.org_name ?? value.name ?? value.nickname,
      raw: JSON.stringify(value).slice(0, 400),
    });
  }
  for (const v of Object.values(value)) collectOrgs(v, hits, source);
};

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const hits = [];
  const seenUrls = new Set();

  page.on('response', async (res) => {
    const url = res.url();
    if (!/mcc\.xiaohongshu\.com\/api\//.test(url)) return;
    if (seenUrls.has(url)) return;
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (!/json/i.test(ct)) return;
      const body = await res.json();
      const before = hits.length;
      collectOrgs(body, hits, url);
      if (hits.length > before) {
        console.log(`\n[org-hit] ${res.status()} ${url}`);
        console.log(JSON.stringify(hits.slice(before), null, 1));
      }
      seenUrls.add(url);
    } catch {
      /* ignore */
    }
  });

  console.log('[*] opening mcc.xiaohongshu.com ...');
  await page.goto('https://mcc.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log(`[*] landed: ${page.url()}`);

  // 尝试点开组织切换器（右上角常见入口），触发组织列表接口
  for (const sel of ['text=切换组织', 'text=组织', '[class*=org]', '[class*=switch]']) {
    const el = page.locator(sel).locator('visible=true').first();
    if (await el.count()) {
      await el.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(2500);
      break;
    }
  }
  await page.screenshot({ path: path.join(__dirname, 'state', `orgs-${TAG || 'default'}.png`) });

  console.log('\n===== 汇总 =====');
  const uniq = new Map();
  for (const h of hits) uniq.set(`${h.orgCode}`, h);
  for (const h of uniq.values()) console.log(`${h.orgCode}  ${h.name ?? ''}  <- ${h.source.slice(0, 100)}`);
  if (!uniq.size) console.log('（未捕获到组织结构，截图见 state/；可 HEADLESS=0 重跑人工点组织切换器）');

  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
