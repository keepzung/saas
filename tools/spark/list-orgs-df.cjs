const fs = require('fs');
const dns = require('dns').promises;
const state = JSON.parse(fs.readFileSync('tools/spark/state/auth.json', 'utf8'));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
(async () => {
  const hosts = ['mcc.xiaohongshu.com', 'ark.xiaohongshu.com', 'fe-static.xiaohongshu.com', 'img.xiaohongshu.com', 'sns-img.xiaohongshu.com', 'ci.xiaohongshu.com'];
  const rules = [];
  for (const h of hosts) {
    try {
      const { address } = await dns.lookup(h, { family: 4 });
      rules.push(`MAP ${h} ${address}`);
      console.log(h, address);
    } catch { console.log(h, 'RESOLVE FAIL'); }
  }
  const { chromium } = require('playwright');
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n===== attempt ${attempt} =====`);
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-ipv6', '--dns-prefetch-disable', `--host-resolver-rules=${rules.join(', ')}`],
    });
    const ctx = await browser.newContext({ storageState: fs.readFileSync('tools/spark/state/auth.json', 'utf8'), viewport: { width: 1440, height: 900 }, userAgent: UA, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const hits = [];
    const collect = (v, src) => {
      if (!v) return;
      if (Array.isArray(v)) { for (const x of v) collect(x, src); return; }
      if (typeof v !== 'object') return;
      if (v.accountOrgCode || v.orgCode || v.org_code) hits.push({ orgCode: v.accountOrgCode ?? v.orgCode ?? v.org_code, name: v.accountOrgName ?? v.orgName ?? v.org_name ?? v.name });
      for (const x of Object.values(v)) collect(x, src);
    };
    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!/xiaohongshu\.com\/api\//.test(url)) return;
        if (!/json/i.test(res.headers()['content-type'] ?? '')) return;
        collect(await res.json(), url);
      } catch {}
    });
    try {
      await page.goto('https://mcc.xiaohongshu.com/micro/data-monitor', { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('landed:', page.url());
      await page.waitForTimeout(8000);
      const uniq = new Map();
      for (const h of hits) uniq.set(String(h.orgCode), h);
      for (const h of uniq.values()) console.log(`ORG ${h.orgCode}  ${h.name ?? ''}`);
      if (uniq.size) {
        await page.screenshot({ path: 'tools/spark/state/orgs-df.png' });
        await browser.close();
        return;
      }
      // 试点组织切换器
      for (const sel of ['text=切换组织', '[class*=switch]', '[class*=org]']) {
        const el = page.locator(sel).locator('visible=true').first();
        if (await el.count()) { await el.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(3000); break; }
      }
      const uniq2 = new Map();
      for (const h of hits) uniq2.set(String(h.orgCode), h);
      for (const h of uniq2.values()) console.log(`ORG ${h.orgCode}  ${h.name ?? ''}`);
      if (uniq2.size) { await page.screenshot({ path: 'tools/spark/state/orgs-df.png' }); await browser.close(); return; }
    } catch (e) {
      console.log('goto fail:', e.message.slice(0, 100));
    }
    await browser.close();
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log('（3 次尝试均未捕获组织）');
})();