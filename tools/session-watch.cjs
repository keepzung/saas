// 会话断线企微快报 — cron 每 30 分钟运行 (放服务器 tools/ 下, 与 patrol.cjs 同目录)
//   node session-watch.cjs           # 判定 + 推送 (未配置 WECOM_WEBHOOK_URL 时仅打印)
//   node session-watch.cjs --dry     # 只打印判定, 不落 state 不推送
// 数据源: SparkSyncLog syncType='keepalive' 最近 3h (服务器 saas-keepalive 每 ~11 分钟一轮)
// 判定: 品牌×通道 (通道=message 前缀 mcc/partner), 自最近一次 success 起连续 failed >= 3 次 (~35 分钟) 判断线
// 去重: state 文件记 <key>: { episode: <lastSuccessAt>, alertedAt }; 同一 episode 只推一次, ALERT_REPEAT_HOURS 后可再提醒
// 恢复: 已告警的 key 出现新 success → 推 "已恢复" 并清掉 episode
// 静音: SKIP_KEYS 里的 key 永不告警 (格力 MCC 组织未开通, 长期已知)
// 退出码: 0 (cron 用; 推送失败只打日志)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = loadEnv(path.join(BACKEND_DIR, '.env'));
const WEBHOOK = ENV.WECOM_WEBHOOK_URL || process.env.WECOM_WEBHOOK_URL || '';

const CONSEC_FAILS = 3;          // 连续失败次数阈值 (~35 分钟)
const WINDOW_HOURS = 3;          // 检查窗口
const ALERT_REPEAT_HOURS = 12;   // 同一 episode 重复提醒间隔
const SKIP_KEYS = new Set(['8:mcc']); // 格力 MCC: 组织未开通, 长期断线已知
const CHANNEL_LABEL = { mcc: '聚光MCC', partner: '合作伙伴' };

const STATE_FILE = path.join(__dirname, 'state', 'session-watch-state.json');
const dry = process.argv.includes('--dry');
const now = Date.now();
const shTime = (d) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');

async function pushWecom(md) {
  if (!WEBHOOK) return false;
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md.slice(0, 4000) } }),
    });
    return r.ok;
  } catch (e) {
    console.error(`[session-watch] 企微推送失败: ${e.message}`);
    return false;
  }
}

(async () => {
  const p = new PrismaClient();
  const brands = await p.brand.findMany({ select: { id: true, name: true } });
  const since = new Date(now - WINDOW_HOURS * 3600_000);
  const rows = await p.sparkSyncLog.findMany({
    where: { syncType: 'keepalive', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { brandId: true, status: true, message: true, createdAt: true },
  });
  await p.$disconnect();

  // 分组: brandId:channel → 时序记录
  const groups = new Map();
  for (const r of rows) {
    const ch = (r.message || '').startsWith('partner') ? 'partner' : (r.message || '').startsWith('mcc') ? 'mcc' : null;
    if (!ch) continue;
    const key = `${r.brandId}:${ch}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let state = {};
  if (fs.existsSync(STATE_FILE)) {
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { state = {}; }
  }
  const nextState = {};
  const alerts = [];
  const recoveries = [];

  for (const [key, list] of groups) {
    if (SKIP_KEYS.has(key)) continue;
    const last = list[list.length - 1];
    const lastSuccess = [...list].reverse().find((r) => r.status === 'success') || null;
    const episodeKey = lastSuccess ? String(new Date(lastSuccess.createdAt).getTime()) : 'never';
    const prev = state[key];

    // 恢复判定: 之前告警过, 且该 episode 已有成功
    if (prev && prev.alertedAt && lastSuccess) {
      recoveries.push({ key, at: lastSuccess.createdAt });
      continue;
    }

    if (last.status !== 'failed') { nextState[key] = prev || { episode: episodeKey }; continue; }
    const failsSince = lastSuccess ? list.filter((r) => r.createdAt > lastSuccess.createdAt && r.status === 'failed').length : list.filter((r) => r.status === 'failed').length;
    if (failsSince < CONSEC_FAILS) { nextState[key] = prev || { episode: episodeKey }; continue; }

    const sinceMin = lastSuccess ? Math.round((now - new Date(lastSuccess.createdAt).getTime()) / 60000) : null;
    const [bid, ch] = key.split(':');
    const b = brands.find((x) => x.id === Number(bid));
    const brandLabel = b ? `${b.name.replace(/项目工作区$/, '')}(${bid})` : `brand${bid}`;
    const lastMsg = String(last.message || '').slice(0, 90);
    const prevAlertedAt = prev && prev.alertedAt ? new Date(prev.alertedAt).getTime() : 0;
    const canRepeat = now - prevAlertedAt > ALERT_REPEAT_HOURS * 3600_000;
    if (prev && prev.alertedAt && prev.episode === episodeKey && !canRepeat) {
      nextState[key] = prev; // 同一事故已推过, 未到重复提醒间隔
      continue;
    }
    alerts.push({
      key,
      md: `> ⚠️ **${brandLabel} ${CHANNEL_LABEL[ch] || ch} 会话断线** ${sinceMin != null ? `(自 ${shTime(new Date(now - sinceMin * 60000))} 起 ~${sinceMin} 分钟)` : ''}\n> 连续失败 ${failsSince} 次, 最近: ${lastMsg}\n> 需人工重登 (每日登录例程 / mcc-login-headed / partner-login-once)`,
      episode: episodeKey,
    });
    nextState[key] = { episode: episodeKey, alertedAt: new Date(now).toISOString() };
  }

  // 已不在窗口内的旧告警 key: 保留 state (等成功后走恢复分支); 窗口数据不足时不动
  for (const k of Object.keys(state)) if (!nextState[k]) nextState[k] = state[k];

  if (alerts.length) {
    const md = [`**小红书会话断线告警 (${alerts.length})**`, ...alerts.map((a) => a.md)].join('\n');
    console.log(`[session-watch] 断线 ${alerts.length}: ${alerts.map((a) => a.key).join(', ')}`);
    if (dry) console.log(md);
    else {
      const ok = await pushWecom(md);
      console.log(`[session-watch] 企微推送: ${ok ? 'ok' : 'skip/fail'}`);
    }
  } else {
    console.log(`[session-watch] ${new Date().toISOString()} 无断线 (检查 ${groups.size} 个品牌通道)`);
  }
  if (recoveries.length && !dry) {
    const md = [`**小红书会话已恢复 (${recoveries.length})**`, ...recoveries.map((r) => `> ✅ ${r.key} 恢复于 ${shTime(new Date(r.at))}`)].join('\n');
    await pushWecom(md);
    console.log(`[session-watch] 恢复推送: ${recoveries.map((r) => r.key).join(', ')}`);
  }
  if (!dry) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 1), 'utf8');
  }
  process.exit(0);
})().catch((e) => {
  console.error(`[session-watch] 执行失败: ${e.message}`);
  process.exit(0);
});
