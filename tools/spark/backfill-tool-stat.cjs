// 获客工具统计（ProClueToolStatDaily）历史回填专用：只拉 tool-stat，跳过线索/用户日重拉
// 与 sync-pro-clues.cjs 的 fetchToolStatDay 逐字段一致；用法:
//   NO_RELOGIN=1 node backfill-tool-stat.cjs --from 2026-01-01 --to 2026-08-31
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }
const findChromium = () => {
  const bases = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    '/root/.cache/ms-playwright',
    '/home/deploy/.cache/ms-playwright',
    path.join(process.env.HOME ?? '', '.cache/ms-playwright'),
  ].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux', 'chrome-win64', 'chrome-win']) {
        const exe = path.join(base, d, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return null;
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CLUE_PAGE = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';
const BRAND_ID = 6;
const argOf = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const dayAdd = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

(async () => {
  const from = argOf('--from');
  const to = argOf('--to') || (() => { const x = new Date(Date.now() - 86400000); return x.toISOString().slice(0, 10); })();
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    console.error('用法: node backfill-tool-stat.cjs --from YYYY-MM-DD [--to YYYY-MM-DD]'); process.exit(1);
  }
  const prisma = new PrismaClient();
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  if (!cfg?.storageState) { console.error('DB 无 storageState'); process.exit(1); }
  const toolAccounts = await prisma.kosAccount.findMany({ where: { brandId: BRAND_ID, status: 'enabled' }, select: { authorId: true } });
  const TOOL_IDS = [...new Set(toolAccounts.map((a) => a.authorId).filter(Boolean))];
  console.log(`[tool-stat-backfill] ${from} ~ ${to}（${Math.round((new Date(to) - new Date(from)) / 86400000) + 1} 天）基线账号 ${TOOL_IDS.length} 个`);

  const browser = await chromium.launch({ headless: true, executablePath: findChromium() ?? undefined, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1600, height: 1000 }, storageState: JSON.parse(cfg.storageState) });
  const page = await ctx.newPage();
  await page.goto(CLUE_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  if (/login|passport/i.test(page.url())) { console.error('登录态失效, url=', page.url()); process.exit(2); }

  const fetchToolStatDay = async (day, ids) => {
    return page.evaluate(async ({ day, ids }) => {
      const post = async (belongUserId) => {
        const r = await fetch('https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId, pageNum: 1, pageSize: 10 }),
        });
        return r.json().catch(() => null);
      };
      const out = [];
      for (const id of ids) {
        const j = await post(id);
        if (!j || j.code !== 0) return { err: `statistical ${id || 'ALL'} 失败: ${String(j?.msg ?? '').slice(0, 60)}` };
        const dKey = day.replace(/-/g, '');
        const row = (j?.data?.userStatisticalDatas ?? []).find((x) => String(x.dtm) === dKey) ?? null;
        out.push({ belongUserId: id, row });
        await new Promise((r2) => setTimeout(r2, 120));
      }
      return { rows: out };
    }, { day, ids });
  };

  const days = [];
  for (let d = from; d <= to; d = dayAdd(d, 1)) days.push(d);
  let done = 0, emptyDays = 0, failed = [];
  for (const day of days) {
    const dayDate = new Date(`${day}T00:00:00.000+08:00`);
    const t = await fetchToolStatDay(day, ['', ...TOOL_IDS]).catch((e) => ({ err: String(e).slice(0, 120) }));
    if (t.err) { failed.push(day); console.log(`[${day}] tool-stat 失败: ${t.err}`); continue; }
    // 防假 0：全局行 null = 平台该日无数据（如功能上线前），整日跳过不写
    const globalRow = t.rows.find((r) => r.belongUserId === '')?.row;
    if (!globalRow) { emptyDays += 1; console.log(`[${day}] 平台无数据行, 跳过`); continue; }
    const F = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    let wrote = 0, zeros = 0;
    for (const r of t.rows) {
      const d = r.row ?? {};
      const sum = ['consultUserCnt', 'msgChatUserCnt', 'msgLeadsUserCnt', 'serviceCardLeadsUserCnt', 'qwAddLeadsUserCnt', 'bookCompLeadsUserCnt', 'landingPageLeadsUserCnt', 'wechatLeadsUserCnt', 'appCardLeadsUserCnt', 'otherLeadsUserCnt'].reduce((s, k) => s + F(d[k]), 0);
      if (!r.row) zeros += 1;
      const data = {
        consultUserCnt: F(d.consultUserCnt), msgChatUserCnt: F(d.msgChatUserCnt), msgLeadsUserCnt: F(d.msgLeadsUserCnt),
        serviceCardLeadsUserCnt: F(d.serviceCardLeadsUserCnt), qwAddLeadsUserCnt: F(d.qwAddLeadsUserCnt),
        bookCompLeadsUserCnt: F(d.bookCompLeadsUserCnt), landingPageLeadsUserCnt: F(d.landingPageLeadsUserCnt),
        wechatLeadsUserCnt: F(d.wechatLeadsUserCnt), appCardLeadsUserCnt: F(d.appCardLeadsUserCnt),
        otherLeadsUserCnt: F(d.otherLeadsUserCnt),
      };
      await prisma.proClueToolStatDaily.upsert({
        where: { brandId_day_belongUserId: { brandId: BRAND_ID, day: dayDate, belongUserId: r.belongUserId } },
        update: data, create: { brandId: BRAND_ID, day: dayDate, belongUserId: r.belongUserId, ...data },
      });
      wrote += 1;
    }
    if (zeros === t.rows.length) emptyDays += 1;
    done += 1;
    if (done % 5 === 0 || done === days.length) {
      console.log(`[${day}] 落库 ${wrote} 行${zeros === t.rows.length ? '（整日平台无数据行,记 0）' : ''}（${done}/${days.length}）`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await prisma.sparkSyncLog.create({ data: { brandId: BRAND_ID, syncType: 'tool_stat_backfill', statDate: `${from}~${to}`, status: failed.length ? 'partial' : 'success', fetched: done, upserted: done * (TOOL_IDS.length + 1), message: `days=${days.length} failed=${failed.length} emptyDays=${emptyDays}` } });
  console.log(`=== 完成 ${done}/${days.length} 天, 失败 ${failed.length} 天${failed.length ? ': ' + failed.join(',') : ''}, 整日空 ${emptyDays} 天`);
  await browser.close();
  process.exit(0);
})();
