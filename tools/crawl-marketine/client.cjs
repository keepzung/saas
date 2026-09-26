// marketine.cn 旧系统爬取客户端
// 协议：POST {base}/login {username, password: SHA1, main_company_id?} → code 10015 多公司 → getcompanybyuserid
// 用法（其他脚本 require）：
//   const { makeClient } = require('./client.cjs');
//   const c = await makeClient(867);            // 东风奕境
//   const data = await c.get('/brand/myList');  // {code:100,data}
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = process.env.CRAWL_BASE || 'https://pyapi.gartech.cc/api/agency-api';
const USERNAME = process.env.CRAWL_USER || '18510234580';
const PASSWORD = process.env.CRAWL_PASS || 'a9527!';
const TOKEN_DIR = path.join(__dirname, '.tokens');

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

async function login(companyId) {
  const body = { username: USERNAME, password: sha1(PASSWORD) };
  if (companyId) body.main_company_id = String(companyId);
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.code !== 100) {
    throw new Error(`login failed: code=${j.code} msg=${j.msg}`);
  }
  const token =
    j.data?.token ?? j.data?.accessToken ?? j.data?.access_token ?? null;
  if (!token) throw new Error('login ok but no token: ' + JSON.stringify(j.data).slice(0, 200));
  return { token, raw: j.data };
}

function makeClient(companyId, brandId) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  const tokenFile = path.join(TOKEN_DIR, `token-${companyId || 'default'}.txt`);
  let token = null;
  if (fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, 'utf8').trim() || null;
  }
  const save = () => fs.writeFileSync(tokenFile, token);

  const call = async (method, p, body, query, retry = true) => {
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.token = token;
    if (brandId) headers['X-Brand-Id'] = String(brandId);
    const res = await fetch(`${BASE}${p}${qs}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j;
    try {
      j = await res.json();
    } catch {
      throw new Error(`non-json ${res.status} ${p}`);
    }
    // 登录态失效则重登一次
    if ((j.code === 10003 || res.status === 401) && retry) {
      token = (await login(companyId)).token;
      save();
      return call(method, p, body, query, false);
    }
    return j;
  };

  return {
    companyId,
    async init() {
      if (!token) {
        token = (await login(companyId)).token;
        save();
      }
      const me = await this.get('/user/info').catch(() => null);
      return me;
    },
    get: (p, query) => call('GET', p, undefined, query),
    post: (p, body, query) => call('POST', p, body, query),
    raw: call,
  };
}

module.exports = { makeClient, sha1, BASE };
