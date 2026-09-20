// 合并验证（单会话低频）：笔记明细日期查询 + 专业号数据页 + 线索页
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'auth.json');
const STATE_DIR = path.join(__dirname, 'state');

const noteListReq = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'req-note-list.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1600, height: 900 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const out = {};

  const apiHits = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/xiaohongshu\.com\/(api|gw)\//i.test(u) && !/apm-fe|spider-tracker|adsmessage|sec\/v1|cs\/check|apollo|question|notice|business_info|role|superLogin|config|apply|grey|current\/user|my_list|init_org|mini_permission/.test(u)) {
      let body = '';
      try { body = (await res.text()).slice(0, 3000); } catch {}
      apiHits.push({ status: res.status(), method: res.request().method(), url: u.slice(0, 250), body });
    }
  });

  await page.goto('https://mcc.xiaohongshu.com/micro/note-data', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);
  for (const t of ['知道啦', '知道了']) {
    const b = page.locator(`text="${t}"`).first();
    if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {});
  }

  // 1. 笔记明细（日期范围）
  const noteList = await page.evaluate(async (body) => {
    const res = await fetch('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, noteListReq);
  out.noteList = noteList;
  const d = noteList.data && noteList.data.detailListVo;
  console.log('[1] noteList total =', d ? d.total : JSON.stringify(noteList).slice(0, 200));
  if (d) {
    const rows = d.detailDataList || d.dataList || d.rowDataList || [];
    console.log('    rows =', rows.length);
    if (rows[0]) console.log('    row0 =', JSON.stringify(rows[0]).slice(0, 1000));
  }

  // 2. 汇总卡片（同样日期范围）
  const sumReq = { ...noteListReq, chart: 'statisticList', dynamicTargets: ['note_cnt','imp_num','engage_num','read_feed_num','avg_view_time','like_num','cmt_num','fav_num','share_num','fans_num_accum'] };
  const sum = await page.evaluate(async (body) => {
    const res = await fetch('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, sumReq);
  out.noteSummary = sum;
  console.log('[2] summary =', JSON.stringify(sum.data && sum.data.detailListVo && (sum.data.detailListVo.detailDataList || [])).slice(0, 600));

  await page.waitForTimeout(5000);
  // 3. 专业号数据页
  apiHits.length = 0;
  await page.goto('https://mcc.xiaohongshu.com/micro/pro-data', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(15000);
  out.proData = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
  out.proDataApis = [...apiHits];
  console.log('[3] pro-data body =', out.proData.slice(0, 500));
  apiHits.forEach((h) => console.log('    API:', h.method, h.url.slice(60)));

  await page.waitForTimeout(5000);
  // 4. 线索数据页
  apiHits.length = 0;
  await page.goto('https://mcc.xiaohongshu.com/micro/clues-data', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(15000);
  out.cluesData = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
  out.cluesDataApis = [...apiHits];
  console.log('[4] clues-data body =', out.cluesData.slice(0, 500));
  apiHits.forEach((h) => console.log('    API:', h.method, h.url.slice(60)));

  fs.writeFileSync(path.join(STATE_DIR, 'final-probe.json'), JSON.stringify(out, null, 2));
  console.log('[DONE] state/final-probe.json');
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
