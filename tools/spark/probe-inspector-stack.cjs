// 一次性工具：连接 node inspector 拉取调用栈（对自旋进程 kill -USR1 后使用）
const os = require('os');
const path = require('path');
const wsModule = process.argv[2] || '/opt/saas/backend/node_modules/ws';
const WebSocket = require(wsModule);
const http = require('http');
http.get('http://127.0.0.1:9229/json/list', (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    const targets = JSON.parse(d);
    const t = targets.find((x) => x.type === 'node');
    if (!t) { console.error('无 node 调试目标'); process.exit(1); }
    const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
    let id = 1;
    const send = (method, params) => ws.send(JSON.stringify({ id: id++, method, params }));
    ws.on('open', () => {
      send('Debugger.enable');
      setTimeout(() => send('Debugger.pause'), 800);
      setTimeout(() => { console.error('10s 超时未捕获 paused'); process.exit(1); }, 10000);
    });
    ws.on('message', (m) => {
      const msg = JSON.parse(m);
      if (msg.method === 'Debugger.paused') {
        (msg.params.callFrames || []).slice(0, 25).forEach((f, i) => {
          console.log(`${i}: ${f.functionName || '(匿名)'} @ ${(f.url || '').replace(/^.*tools\//, 'tools/')}:${f.location.lineNumber + 1}:${f.location.columnNumber}`);
        });
        send('Debugger.resume');
        setTimeout(() => process.exit(0), 300);
      }
    });
    ws.on('error', (e) => { console.error('ws 错误', e.message); process.exit(1); });
  });
});
