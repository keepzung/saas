/* 更新 brand5 MorganDaDa 的 MCC cookie（SparkOrgConfig 权威源）+ 触发恢复同步 + 对账
 * 用法: 把完整 Cookie 字符串写入 /tmp/mcc-cookie-b5.txt 后执行
 *       NODE_PATH=/opt/saas/backend/node_modules node /opt/saas/tools/apply-mcc-cookie-b5.cjs
 * 流程: 1) 校验 cookie 可用（调 MCC current user） 2) 更新 SparkOrgConfig(brandId=5)
 *       3) 重启 saas-api 刷新组织缓存 4) notes/notes_daily 同步 + clue_analysis 逐日回补 10-01~10-21
 *       5) 运行 recon-mdd-mcc.cjs 对账 */
const fs = require('fs');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cookie = fs.readFileSync('/tmp/mcc-cookie-b5.txt', 'utf8').replace(/^SPARK_COOKIE=\s*/i, '').trim();
  if (!/xiaohongshu|web_session|a1=/i.test(cookie) || cookie.length < 100) throw new Error('cookie 内容不像有效的登录态（过短或缺关键字段）');

  // 1) 校验
  const check = await fetch(`${BASE}/api/mcc/current/user/v2`, { headers: { Cookie: cookie, 'User-Agent': UA } });
  const me = await check.json().catch(() => ({}));
  console.log('[1/5] cookie 校验:', `code=${me.code} nickname=${me.data?.nickname ?? me.data?.name ?? '?'}`);
  if (me.code !== 0 && me.success !== true) throw new Error('cookie 校验失败（可能不完整或已过期）');

  // 2) 更新 DB（不落地明文日志）
  await p.sparkOrgConfig.updateMany({ where: { brandId: 5 }, data: { cookie, active: true } });
  console.log('[2/5] SparkOrgConfig(brandId=5) cookie 已更新');
  await p.$disconnect();

  // 3) 重启 API 刷新组织缓存
  execSync('pm2 restart saas-api --update-env >/dev/null 2>&1');
  await sleep(6000);
  console.log('[3/5] saas-api 已重启');

  // 4) 恢复同步：notes / notes_daily + clue_analysis 逐日回补（内部调度器只回 7 天）
  const trigger = (args) => {
    try {
      const out = execSync(`cd /opt/saas && node tools/trigger-sync.cjs ${args} 2>&1`, { encoding: 'utf8', timeout: 300000 });
      console.log(`[4/5] trigger ${args} → ${out.split('\n').filter((l) => /status|message|upserted/.test(l)).map((l) => l.trim()).join(' ').slice(0, 160)}`);
    } catch (e) {
      console.log(`[4/5] trigger ${args} 失败: ${String(e.message).slice(0, 160)}`);
    }
  };
  trigger('notes 5');
  trigger('notes_daily 5');
  for (let d = new Date('2026-10-01T00:00:00+08:00'); d <= new Date('2026-10-21T00:00:00+08:00'); d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    trigger(`clue_analysis 5 --date=${day}`);
    await sleep(500);
  }
  console.log('[4/5] 同步触发完成，等待 10s 后对账');
  await sleep(10000);

  // 5) 对账
  const recon = execSync(`cd /opt/saas/backend && NODE_PATH=/opt/saas/backend/node_modules node /opt/saas/tools/spark/recon-mdd-mcc.cjs 2026-10-01 2026-10-20 2>&1`, { encoding: 'utf8', timeout: 300000 });
  console.log('[5/5] 对账结果:\n' + recon);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
