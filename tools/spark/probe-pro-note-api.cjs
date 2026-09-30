// 页面上下文内猜测笔记级接口：kos/data/note/list 变体 + butterfly blockKey 枚举
// 用法: TAG=tesla2 NO_PROXY=1 node probe-pro-note-api.cjs
const { chromium } = require('playwright');
const path = require('path');

const TAG = (process.env.TAG || 'tesla2').trim();
const launchOpts = process.env.NO_PROXY === '1' ? { args: ['--no-proxy-server'] } : {};
const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const END = fmt(today);
const START = fmt(new Date(today.getTime() - 6 * 86400000));

(async () => {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, `state/auth-${TAG}.json`),
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  for (let i = 1; i <= 4; i++) {
    try {
      await page.goto('https://pro.xiaohongshu.com/app-datacenter/note-performance', { waitUntil: 'domcontentloaded', timeout: 45000 });
      break;
    } catch { await page.waitForTimeout(3000); }
  }
  await page.waitForTimeout(6000);

  const inFetch = (p, body) =>
    page.evaluate(async ({ p, body }) => {
      try {
        const res = await fetch(p, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch (e) {
        return { fetchErr: String(e) };
      }
    }, { p, body });

  const brief = (j) => {
    if (!j) return 'null';
    const s = JSON.stringify(j);
    if (s.length < 260) return s;
    // 提取 data.total 与首行
    try {
      const total = j?.data?.total ?? j?.data?.dto?.total ?? '?';
      const firstKey = Object.keys(j?.data ?? {})[0];
      return `code=${j.code} total=${total} firstKey=${firstKey} len=${s.length}`;
    } catch { return s.slice(0, 200); }
  };

  console.log('== A. kos/data/note/* 路径猜测 ==');
  const notePaths = [
    '/api/edith/ads/pro/kos/data/note/list',
    '/api/edith/ads/pro/kos/data/notes',
    '/api/edith/ads/pro/kos/data/note',
    '/api/edith/ads/pro/kos/note/list',
    '/api/edith/ads/pro/kos/data/staff/note/list',
  ];
  for (const p of notePaths) {
    const j = await inFetch(p, { pageNum: 1, pageSize: 5, dateType: 2, startDate: START, endDate: END, interestsStatus: 2, kosUserId: '', area: { country: '', province: '', city: '' }, staffLabel: '', orderClauses: [] });
    console.log(`${p} -> ${brief(j)}`);
  }

  console.log('\n== B. butterfly blockKey 枚举 ==');
  const blockKeys = ['noteList', 'notePerformanceList', 'xhsNoteList', 'notesList', 'notePerformance', 'kosNoteList', 'staffNoteList', 'noteDataList', 'kosNoteTable'];
  for (const bk of blockKeys) {
    const j = await inFetch('/api/edith/data_center/butterfly/data', { requestBody: { blockElements: [{ blockKey: bk, filterMap: { dateType: 2 } }] } });
    const s = JSON.stringify(j ?? {});
    if (s && s !== '{"code":500,"success":false,"msg":"服务异常","data":null}' && s.length > 60) {
      console.log(`blockKey=${bk} -> ${brief(j)}\n    ${s.slice(0, 700)}`);
    } else {
      console.log(`blockKey=${bk} -> 空/异常`);
    }
  }

  console.log('\n== C. staff/list 大分页验证（拿全量 199） ==');
  const st = await inFetch('/api/edith/ads/pro/kos/data/staff/list', { kosUserId: '', area: { country: '', province: '', city: '' }, staffLabel: '', pageNum: 1, pageSize: 200, dateType: 2, interestsStatus: 2, startDate: START, endDate: END, orderClauses: [] });
  const rows = st?.data?.dtos ?? [];
  console.log(`staff rows=${rows.length} total=${st?.data?.total ?? '?'}`);
  if (rows.length) {
    console.log('首行字段:', JSON.stringify(Object.keys(rows[0])));
    console.log('首行:', JSON.stringify(rows[0]).slice(0, 500));
  }

  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
