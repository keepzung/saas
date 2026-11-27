#!/usr/bin/env node
// 本机 HTTP 代理(家宽出口)——供服务器经 ssh 反向隧道使用,让 MCC/专业号流量
// 从家宽 IP 出去(规避机房 IP 风控)。仅监听 127.0.0.1,不对外暴露。
// 用法: node proxy-server.cjs [端口=13128]
// 配套: proxy-tunnel.cjs(反向隧道+自动重连)
const http = require('http');
const net = require('net');
const PORT = Number(process.argv[2]) || 13128;

const server = http.createServer((req, res) => {
  // 普通 HTTP 代理(绝对 URI 形式)
  let u;
  try { u = new URL(req.url); } catch { res.destroy(); return; }
  const up = http.request(
    { host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
  );
  up.on('error', () => res.destroy());
  req.pipe(up);
});

server.on('connect', (req, clientSocket, head) => {
  // HTTPS 代理(CONNECT 隧道,undici ProxyAgent 走这条路)
  const idx = req.url.lastIndexOf(':');
  const host = idx > 0 ? req.url.slice(0, idx) : req.url;
  const port = idx > 0 ? Number(req.url.slice(idx + 1)) || 443 : 443;
  const up = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) up.write(head);
    up.pipe(clientSocket);
    clientSocket.pipe(up);
  });
  up.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => up.destroy());
  up.setTimeout(600000, () => { up.destroy(); clientSocket.destroy(); });
  clientSocket.setTimeout(600000, () => { up.destroy(); clientSocket.destroy(); });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[home-proxy] listening 127.0.0.1:${PORT} (家宽出口)`));
server.on('error', (e) => { console.error('[home-proxy] error:', e.message); process.exit(1); });
