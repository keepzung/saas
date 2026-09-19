#!/usr/bin/env node
/**
 * 来鼓 OpenAPI 只读探测脚本
 * 用法：node tools/probe-laigu.js [endpoint]     默认 chat/list
 * 签名：MD5(app_key + timestamp + nonce + body_hash + secret_key)
 * body_hash = body key 按 ASCII 排序后的紧凑 JSON 的 MD5（已对文档示例值校准）
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const BASE_URL = process.env.LAIGU_BASE_URL || 'http://api-gateway.meiqia.cn/openapi';
const APP_KEY = process.env.LAIGU_APP_KEY;
const SECRET = process.env.LAIGU_SECRET;

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** body key 按 ASCII 排序 → 紧凑 JSON（与文档示例 88f99678... 校准一致） */
function sortedCompactJson(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

function buildHeaders(body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = body ? md5(sortedCompactJson(body)) : '';
  const signature = md5(APP_KEY + timestamp + nonce + bodyHash + SECRET);
  return {
    'Content-Type': 'application/json',
    'X-App-Key': APP_KEY,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
}

async function call(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = buildHeaders(body || undefined);
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? sortedCompactJson(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 500);
  }
  return { status: res.status, json };
}

function brief(value, max = 1200) {
  const s = JSON.stringify(value, null, 2);
  return s.length > max ? s.slice(0, max) + `\n...（截断，总长 ${s.length}）` : s;
}

async function main() {
  if (!APP_KEY || !SECRET) {
    console.error('缺少 LAIGU_APP_KEY / LAIGU_SECRET');
    process.exit(1);
  }
  const targets = process.argv[2]
    ? [{ endpoint: process.argv[2], body: makeBody(process.argv[2]) }]
    : [
        { endpoint: '/chat/list', body: makeBody('/chat/list') },
        { endpoint: '/chat/detail', body: makeBody('/chat/detail') },
        { endpoint: '/message/list', body: makeBody('/message/list') },
        { endpoint: '/chat/messages', body: makeBody('/chat/messages') },
        { endpoint: '/lead/list', body: makeBody('/lead/list') },
      ];
  for (const t of targets) {
    try {
      const r = await call(t.endpoint, t.body);
      console.log(`\n===== POST ${t.endpoint} → HTTP ${r.status} =====`);
      console.log(brief(r.json));
    } catch (e) {
      console.log(`\n===== POST ${t.endpoint} → 请求失败: ${e.message} =====`);
    }
  }
}

function makeBody(endpoint) {
  const now = Math.floor(Date.now() / 1000);
  const week = 7 * 24 * 3600;
  const base = { from_tm: now - week, page: 1, page_size: 10, to_tm: now };
  if (endpoint.includes('detail')) return { chat_id: '1', ...base };
  return base;
}

main();
