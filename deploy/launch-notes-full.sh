#!/bin/bash
# 清理残留探针 + 后台启动全量笔记回填（nohup，断开 ssh 也继续跑）
pkill -f 'probe-write' 2>/dev/null
rm -f /opt/saas/backend/probe-write.js /tmp/probe.log /tmp/probe-write.js
cat > /opt/saas/backend/notes-full-job.cjs <<'EOF'
const crypto = require('crypto');
const BASE = 'http://127.0.0.1:3000/api/agency-api';
(async () => {
  const password = crypto.createHash('sha1').update('Marketine@2026').digest('hex');
  let res = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '18510234580', password }) }).then(r => r.json());
  if (res.code === 10015) res = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '18510234580', password, main_company_id: '2' }) }).then(r => r.json());
  const token = res.data.token;
  console.log('token ok, starting full notes sync...');
  const t0 = Date.now();
  const sync = await fetch(BASE + '/spark/sync', { method: 'POST', headers: { token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'notes', full: true }) }).then(r => r.json());
  console.log('RESULT:', JSON.stringify(sync.data ?? sync));
  console.log('elapsed:', Math.round((Date.now() - t0) / 1000) + 's');
})().catch(e => { console.error('JOB ERR:', e.message); process.exit(1); });
EOF
chown deploy:deploy /opt/saas/backend/notes-full-job.cjs
cd /opt/saas/backend
sudo -u deploy bash -lc 'nohup node notes-full-job.cjs > /tmp/notes-full.log 2>&1 & echo BG_PID=$!'
echo '=== background job launched, log: /tmp/notes-full.log'
