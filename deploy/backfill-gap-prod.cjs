// 补同步断档：campaign 指定日期 + notes backfill（35 天发布窗口，curl 绕 undici 300s 超时）
const crypto = require('crypto');
const { execSync } = require('child_process');
const B = 'http://127.0.0.1:3000/api/agency-api';
const USER = '18510234580';
const PASS = process.env.PROD_ADMIN_PASSWORD || 'Marketine@2026';
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

async function login() {
  let r = await fetch(`${B}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: sha1(PASS) }),
  });
  let j = await r.json();
  if (j.code === 10015) {
    const c = await (await fetch(`${B}/getcompanybyuserid?user_id=${j.data.user_id}`)).json();
    const t = c.data.find((x) => x.admin_flag === 1) || c.data[0];
    r = await fetch(`${B}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: sha1(PASS), main_company_id: String(t.main_company_id) }),
    });
    j = await r.json();
  }
  if (j.code !== 100) throw new Error('login failed');
  return j.data.token;
}

(async () => {
  const token = await login();
  const withRetry = async (fn, label, tries = 6) => {
    for (let i = 1; i <= tries; i += 1) {
      try {
        return await fn();
      } catch (e) {
        console.log(`${label} 第${i}次失败: ${String(e.message).slice(0, 80)}`);
        if (i === tries) throw e;
        await new Promise((res) => setTimeout(res, i * 5000));
      }
    }
  };
  for (const d of ['2026-09-23', '2026-09-24']) {
    const out = await withRetry(async () => {
      const r = await fetch(`${B}/spark/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({ type: 'campaign', date: d }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.code !== 100) throw new Error(j.msg ?? 'code=' + j.code);
      return j;
    }, `campaign ${d}`);
    console.log(`campaign ${d}:`, JSON.stringify(out.data).slice(0, 200));
  }
  const out2 = await withRetry(async () => {
    const res = execSync(
      `curl -s -m 600 --retry 3 -X POST ${B}/spark/sync -H 'Content-Type: application/json' -H 'token: ${token}' -d '{"type":"notes","backfill":true}'`,
      { timeout: 620000 },
    ).toString();
    const j = JSON.parse(res);
    if (j.code !== 100) throw new Error(j.msg ?? 'notes code=' + j.code);
    return j;
  }, 'notes backfill');
  console.log('notes backfill:', JSON.stringify(out2.data ?? out2).slice(0, 300));
  const st = await (await fetch(`${B}/spark/status`, { headers: { token } })).json();
  console.log('recent logs:', JSON.stringify(
    (st.data?.recent_logs ?? []).map((l) => `${l.syncType}@${l.statDate}:${l.status}/${l.upserted}`),
  ));
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
