#!/usr/bin/env node
// 家宽代理总控(本机常驻):①本机代理 ②服务器反向隧道(自动重连)。
// 服务器侧用法: 后端 .env 设 MCC_PROXY_URL=http://127.0.0.1:13128,
// 小红书域名的 fetch 即经「服务器 127.0.0.1:13128 → ssh 隧道 → 本机代理 → 家宽 IP」出去。
// 用法: node proxy-tunnel.cjs   (常驻;建议加 Windows 登录自启)
const { spawn } = require('child_process');
const path = require('path');
const SERVER = process.env.TUNNEL_SERVER || 'root@119.28.157.150';
const PORT = 13128;

function sh(cmd, args, label) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('exit', (code) => console.log(`[${label}] exit ${code}`));
  return p;
}

// ① 本机代理(常驻,退出即重启)
(function startProxy() {
  console.log('[proxy] starting...');
  const p = sh(process.execPath, [path.join(__dirname, 'proxy-server.cjs'), String(PORT)], 'proxy');
  p.on('exit', () => setTimeout(startProxy, 3000));
})();

// ② 反向隧道:服务器 127.0.0.1:13128 → 本机 13128(自动重连)
let gen = 0;
(function startTunnel() {
  const myGen = ++gen;
  console.log(`[tunnel#${myGen}] starting...`);
  const p = sh(
    'ssh',
    ['-R', `${PORT}:127.0.0.1:${PORT}`, '-N', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=15', SERVER],
    `tunnel#${myGen}`,
  );
  p.on('exit', (code) => {
    if (myGen === gen) setTimeout(startTunnel, 5000); // 被替换/断线 → 5 秒重连
  });
})();

// ③ 每 5 分钟自检:经代理访问 MCC,失败连续 3 次则重建隧道
let failStreak = 0;
setInterval(async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_config_list`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: ctrl.signal,
    });
    clearTimeout(t);
    console.log(`[selfcheck] proxy reachable, http=${res.status}`);
    failStreak = 0;
  } catch (e) {
    failStreak++;
    console.log(`[selfcheck] fail x${failStreak}: ${e.message.slice(0, 50)}`);
    if (failStreak >= 3) { gen++; startTunnel(); failStreak = 0; }
  }
}, 5 * 60_000).unref();
