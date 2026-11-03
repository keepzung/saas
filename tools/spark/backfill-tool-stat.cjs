// 获客工具统计（ProClueToolStatDaily）历史回填 v6：纯 node fetch，按 UID(authorId) 逐日逐账号
// v6=全步骤取证版（每一步同步写 /opt/saas/logs/bts-debug-<pid>.log, OOM/挂死后读它定位卡点）
// 修复史: fetch 阶段前必须 prisma.$disconnect()（探针=断开后 fetch 正常, 带活连接 fetch 挂死/OOM 11-03 事故）;
//   upsert/收尾前 $connect 重连; 防假 0=全局行 null 整日跳过; 响应体 >5MB 抛错
// 用法: node backfill-tool-stat.cjs --from 2026-01-01 [--to 2026-08-31]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BRAND_ID = 6;
const API = 'https://pro.xiaohongshu.com/api/edith/ads/pro/clue_manager/statistical/list';
const argOf = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const dayAdd = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }; // 纯 UTC 运算——CST 服务器上 setDate+toISOString 会原地踏步(11-03 死循环 OOM 事故)
const F = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const logf = (s) => { try { fs.appendFileSync(`/opt/saas/logs/bts-debug-${process.pid}.log`, `${new Date().toISOString()} ${s}\n`); } catch {} };

logf('requires 完成');
(async () => {
  const from = argOf('--from');
  const to = argOf('--to') || (() => { const x = new Date(Date.now() - 86400000); return x.toISOString().slice(0, 10); })();
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    console.error('用法: node backfill-tool-stat.cjs --from YYYY-MM-DD [--to YYYY-MM-DD]'); process.exit(1);
  }
  logf(`参数 from=${from} to=${to}`);
  const prisma = new PrismaClient();
  logf('prisma client 创建');
  const cfg = await prisma.proOrgConfig.findUnique({ where: { brandId: BRAND_ID } });
  logf(`cfg ${cfg?.storageState ? 'ok(' + cfg.storageState.length + 'B)' : '缺失'}`);
  if (!cfg?.storageState) { console.error('DB 无 storageState'); process.exit(1); }
  const cookieStr = JSON.parse(cfg.storageState).cookies
    .filter((c) => /xiaohongshu\.com$/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`).join('; ');
  logf(`cookieStr ${cookieStr.length}B`);
  const toolAccounts = await prisma.kosAccount.findMany({ where: { brandId: BRAND_ID, status: 'enabled' }, select: { authorId: true } });
  const TOOL_IDS = ['', ...new Set(toolAccounts.map((a) => a.authorId).filter(Boolean))];
  console.log(`[tool-stat-backfill] ${from} ~ ${to} 基线账号 ${TOOL_IDS.length - 1} 个`);
  logf(`TOOL_IDS ${TOOL_IDS.length - 1} 个, header 已打印`);

  const fetchOne = async (day, uid) => {
    logf(`  fetch ${uid || 'ALL'} ${day} 开始`);
    let j = null;
    // code=300013 限流退避: 等 60s 重试, 最多 40 次(约 40 分钟, 覆盖风控冷却窗口)
    for (let attempt = 1; attempt <= 40; attempt++) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieStr, Referer: 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management', Origin: 'https://pro.xiaohongshu.com', 'User-Agent': UA },
        body: JSON.stringify({ startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', belongUserId: uid, pageNum: 1, pageSize: 10 }),
      });
      let total = 0; const chunks = [];
      for await (const c of res.body) { total += c.length; chunks.push(c); if (total > 5e6) throw new Error(`body>5MB http=${res.status}`); }
      j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (j.code === 300013) {
        logf(`  限流 300013, 第 ${attempt} 次退避 60s (${uid || 'ALL'} ${day})`);
        await new Promise((r) => setTimeout(r, 60000));
        continue;
      }
      break;
    }
    if (j.code !== 0) throw new Error(`code=${j.code} ${String(j.msg ?? '').slice(0, 50)}`);
    const dKey = day.replace(/-/g, '');
    const row = (j?.data?.userStatisticalDatas ?? []).find((x) => String(x.dtm) === dKey) ?? null;
    logf(`  fetch ${uid || 'ALL'} 解析完成 row=${row ? '有' : 'null'}`);
    return row;
  };

  // ── fetch 阶段：彻底断开 prisma（与探针同构, 带活连接 fetch 会挂死）──
  const days = [];
  for (let d = from; d <= to; d = dayAdd(d, 1)) days.push(d);
  let done = 0, emptyDays = 0, failed = [];
  const bag = new Map();
  logf(`fetch 阶段开始: ${days.length} 天`);
  await prisma.$disconnect();
  logf(`prisma 已断开`);

  for (const day of days) {
    const rows = [];
    try {
      let accN = 0;
      for (const uid of TOOL_IDS) {
        rows.push({ belongUserId: uid, row: await fetchOne(day, uid) });
        accN += 1;
        if (accN % 40 === 0) logf(`${day} acc=${accN}/${TOOL_IDS.length}`);
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      failed.push(day);
      logf(`[${day}] tool-stat 失败: ${String(e.message).slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    bag.set(day, rows);
    done += 1;
    if (!rows[0].row) emptyDays += 1;
    logf(`[${day}] 抓取完成 ${rows.length} 行${rows[0].row ? '' : '（平台无数据）'}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  logf(`fetch 阶段结束: 完成 ${done}/${days.length}, 失败 ${failed.length}, 空日 ${emptyDays}`);

  // ── 落库阶段：重连 prisma ──
  await prisma.$connect();
  logf('prisma 已重连');
  for (const [day, rows] of bag) {
    if (!rows[0].row) continue; // 空日不落库
    const dayDate = new Date(`${day}T00:00:00.000+08:00`);
    for (const r of rows) {
      const d = r.row ?? {};
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
    }
  }
  logf('upsert 完成');
  await prisma.sparkSyncLog.create({ data: { brandId: BRAND_ID, syncType: 'tool_stat_backfill', statDate: `${from}~${to}`, status: failed.length ? 'partial' : 'success', fetched: done, upserted: done * TOOL_IDS.length, message: `days=${days.length} ok=${done} failed=${failed.length} emptyDays=${emptyDays}` } });
  console.log(`=== 完成 ${done}/${days.length} 天, 失败 ${failed.length}${failed.length ? ': ' + failed.join(',') : ''}, 平台无数据跳过 ${emptyDays} 天`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { logf(`FATAL ${String(e && e.stack ? e.stack : e).slice(0, 200)}`); console.error('FATAL', e); process.exit(1); });
