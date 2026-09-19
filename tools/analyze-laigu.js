#!/usr/bin/env node
/** 分析 /chat/messages 完整响应结构（只读） */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sortedCompactJson = (obj) => {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
};

async function chatMessages(body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyStr = sortedCompactJson(body);
  const signature = md5(process.env.LAIGU_APP_KEY + timestamp + nonce + md5(bodyStr) + process.env.LAIGU_SECRET);
  const res = await fetch(`${process.env.LAIGU_BASE_URL}/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Key': process.env.LAIGU_APP_KEY,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    },
    body: bodyStr,
  });
  return { status: res.status, json: await res.json() };
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  return typeof v;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const pageSize = Number(process.argv[2] || 10);
  const days = Number(process.argv[3] || 30);
  const page = Number(process.argv[4] || 1);
  console.log(`参数: page_size=${pageSize} days=${days} page=${page}`);
  const r = await chatMessages({ from_tm: now - days * 24 * 3600, page, page_size: pageSize, to_tm: now });
  console.log(`HTTP ${r.status} success=${r.json.success} code=${r.json.code} message=${r.json.message || ''}`);
  if (!r.json.success) return;
  const data = r.json.data || {};
  console.log(`data 顶层字段: ${Object.keys(data).map((k) => `${k}:${typeOf(data[k])}`).join(', ')}`);
  const sessions = data.sessions || [];
  console.log(`\nsessions 数量: ${sessions.length}`);
  if (!sessions.length) return;

  // 所有 session 字段汇总
  const sessionKeys = new Map();
  for (const s of sessions) for (const k of Object.keys(s)) sessionKeys.set(k, typeOf(s[k]));
  console.log(`\nsession 字段:`);
  for (const [k, t] of sessionKeys) console.log(`  ${k}: ${t}`);

  // 消息角色/类型分布
  const roleDist = new Map();
  const msgKeys = new Map();
  let totalMsgs = 0;
  let msgIdSamples = [];
  for (const s of sessions) {
    for (const m of s.messages || []) {
      totalMsgs++;
      roleDist.set(m.role, (roleDist.get(m.role) || 0) + 1);
      for (const k of Object.keys(m)) msgKeys.set(k, typeOf(m[k]));
      if (msgIdSamples.length < 5) msgIdSamples.push(m.id);
    }
  }
  console.log(`\n消息总数: ${totalMsgs}，角色分布: ${[...roleDist.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`message 字段:`);
  for (const [k, t] of msgKeys) console.log(`  ${k}: ${t}`);

  // 客户消息样例（role != ai_employee）
  console.log(`\n--- 客户消息样例（前 5 条） ---`);
  let shown = 0;
  for (const s of sessions) {
    for (const m of s.messages || []) {
      if (m.role !== 'ai_employee' && shown < 5) {
        shown++;
        console.log(JSON.stringify({ session_id: s.session_id, client_name: s.client_name, ...m }, null, 2).slice(0, 600));
      }
    }
  }

  // client_attrs / customer_impression / ad_info 非空样例
  for (const field of ['client_attrs', 'customer_impression', 'ad_info']) {
    const nonEmpty = sessions.filter((s) => s[field] && Object.keys(s[field]).length);
    console.log(`\n${field} 非空: ${nonEmpty.length}/${sessions.length}`);
    if (nonEmpty.length) console.log(JSON.stringify(nonEmpty[0][field]).slice(0, 300));
  }

  // 时间范围
  const ends = sessions.map((s) => s.ended_at).filter(Boolean).sort((a, b) => a - b);
  if (ends.length) console.log(`\nended_at 范围: ${new Date(ends[0] * 1000).toISOString()} ~ ${new Date(ends[ends.length - 1] * 1000).toISOString()}`);

  // source 分布
  const srcDist = new Map();
  for (const s of sessions) srcDist.set(s.source, (srcDist.get(s.source) || 0) + 1);
  console.log(`source 分布: ${[...srcDist.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // 完整第一 session（截断 messages）
  const first = { ...sessions[0], messages: (sessions[0].messages || []).slice(0, 2) };
  console.log(`\n--- 第一条 session 完整结构（messages 截断到 2 条） ---`);
  console.log(JSON.stringify(first, null, 2).slice(0, 2500));

  // 翻页探测：page=2
  const r2 = await chatMessages({ from_tm: now - days * 24 * 3600, page: page + 1, page_size: pageSize, to_tm: now });
  console.log(`\npage=${page + 1} sessions: ${(r2.json.data && r2.json.data.sessions || []).length}，与当前页首条 session_id 是否不同: ${r2.json.data?.sessions?.[0]?.session_id !== sessions[0]?.session_id}`);

  // 大窗口探测
  const r3 = await chatMessages({ from_tm: now - 365 * 24 * 3600, page: 1, page_size: pageSize, to_tm: now });
  console.log(`\n365 天窗口 sessions: ${(r3.json.data && r3.json.data.sessions || []).length}`);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
