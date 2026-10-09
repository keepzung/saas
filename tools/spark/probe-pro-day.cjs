// 专业号「数据中心→员工数据」日档参数探针：
// 验证 staff/list / overview 接口传 dateType=4（或其他值）+ startDate=endDate=单日 是否返回当日数据。
// 用法: node probe-pro-day.cjs [TAG]   （state 默认 state/auth-pro.json）
// 判定方法：同一天的数据，日档值应明显小于 近7日/近30日 档；且能查历史单日（自定义回填能力）。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = (process.argv[2] || process.env.TAG || 'pro').trim();
const STATE = path.join(__dirname, 'state', `auth-${TAG}.json`);
if (!fs.existsSync(STATE)) {
  console.error(`state 不存在: ${STATE}（先 node login-pro.cjs）`);
  process.exit(1);
}

// 取一个确定有数据的完整历史日（前 3 天），以及对照窗口
const dayStr = (offset) => {
  const d = new Date(Date.now() - offset * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
};
const DAY = dayStr(3);
const DAY_NEAR = dayStr(1);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto('https://pro.xiaohongshu.com/enterprise/data/get-customer', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(5000);

  const call = (p, body) =>
    page.evaluate(
      async ({ p, body }) => {
        const res = await fetch(p, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        return res.json();
      },
      { p, body },
    );

  const staffBody = (dateType, startDate, endDate, pageNum = 1) => ({
    kosUserId: '',
    area: { country: '', province: '', city: '' },
    staffLabel: '',
    pageNum,
    pageSize: 5,
    dateType,
    interestsStatus: 2,
    startDate,
    endDate,
    orderClauses: [],
  });
  const ovBody = (dateType, startDate, endDate) => ({ dateType, startDate, endDate });

  const brief = (j) => {
    const code = j?.code;
    const total = j?.data?.total ?? j?.data?.totalCount ?? '-';
    const row = j?.data?.dtos?.[0];
    if (!row) return `code=${code} total=${total}`;
    return `code=${code} total=${total} sample[${row.nickName}] note=${row.createNoteNum} imp=${row.socImpCnt} click=${row.socClickCnt} engage=${row.socEnageCnt} open=${row.messageOpenCnt} leads=${row.msgLeadsNum}`;
  };

  console.log(`== 对照基准 ==`);
  for (const dt of [1, 2, 3]) {
    const win = dt === 1 ? [DAY_NEAR, DAY_NEAR] : dt === 2 ? [dayStr(7), DAY_NEAR] : [dayStr(30), DAY_NEAR];
    const j = await call('/api/edith/ads/pro/kos/data/staff/list', staffBody(dt, win[0], win[1]));
    console.log(`staff dateType=${dt} win=${win[0]}~${win[1]}: ${brief(j)}`);
  }

  console.log(`\n== 日档候选：单日 ${DAY}（前3天，验证历史可查） ==`);
  for (const dt of [4, 5, 6, 7]) {
    const j = await call('/api/edith/ads/pro/kos/data/staff/list', staffBody(dt, DAY, DAY));
    console.log(`staff dateType=${dt} win=${DAY}~${DAY}: ${brief(j)}`);
  }

  console.log(`\n== 日档候选：单日 ${DAY_NEAR}（昨日，对照近1日档） ==`);
  for (const dt of [4, 5, 6, 7]) {
    const j = await call('/api/edith/ads/pro/kos/data/staff/list', staffBody(dt, DAY_NEAR, DAY_NEAR));
    console.log(`staff dateType=${dt} win=${DAY_NEAR}~${DAY_NEAR}: ${brief(j)}`);
  }

  console.log(`\n== overview 日档候选 ==`);
  for (const dt of [4, 5]) {
    const j = await call('/api/edith/ads/pro/kos/data/overview', ovBody(dt, DAY, DAY));
    const d = j?.data ?? {};
    console.log(
      `overview dateType=${dt} win=${DAY}~${DAY}: code=${j?.code} note=${d.createNoteNum} read=${d.socReadCnt} open=${d.messageOpenCnt} leads=${d.msgLeadsNum}`,
    );
  }

  await browser.close();
  console.log('\n完成。判定：某 dateType 单日返回 total>0 且指标明显小于近7日档 → 即为日档参数。');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
