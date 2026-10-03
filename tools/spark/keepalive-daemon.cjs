#!/usr/bin/env node
// 会话保活守护（48h pilot）：每 KEEPALIVE_INTERVAL_MINUTES 分钟对每个 active 的 sparkOrgConfig 探活
//   partner (brand6): GET partner watch-dashboard（manual redirect，30x→login = 失效）
//   mcc (brand2/7/8): GET mcc aurora-data 页面（redirect→login = 失效）
// 续期：合并响应 Set-Cookie 回写 sparkOrgConfig.cookie（有变化才写）
// 失效：partner 无头账密自动重登一次（滑块则标记 need_manual_login）；mcc 预留 SPARK_ACCOUNT_B{brandId} 账密重登
// 记录：每轮每品牌一条 SparkSyncLog(syncType='keepalive') + keepalive-state.json 心跳文件
// 用法: pm2 start keepalive-daemon.cjs --name saas-keepalive   （env: KEEPALIVE_INTERVAL_MINUTES=10）
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const INTERVAL_MIN = Number(process.env.KEEPALIVE_INTERVAL_MINUTES || 10);
const RELOGIN_COOLDOWN_MIN = 30;
const LOG_DIR = process.env.KEEPALIVE_LOG_DIR || path.join(ROOT, 'tools/spark/state');
const STATE_FILE = path.join(LOG_DIR, 'keepalive-state.json');

const prisma = new PrismaClient();
const state = {}; // brandId -> { lastOk, lastFail, consecutiveFails, lastReloginAt, alive, lastLatency }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function loadState() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch {}
}
function saveState() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); } catch {}
}

/** 把 Set-Cookie 头合并进现有 cookie 串 */
function mergeCookies(cookieStr, setCookieList) {
  if (!setCookieList || !setCookieList.length) return cookieStr;
  const jar = new Map();
  for (const pair of (cookieStr || '').split('; ')) {
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  for (const sc of setCookieList) {
    const first = sc.split(';')[0];
    const i = first.indexOf('=');
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function probeUrl(url, cookie) {
  // 返回 { alive, setCookies, status, finalNote }；网络错误与真实会话失效分开（netError 不触发重登）
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      headers: { Cookie: cookie || '', 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const loc = res.headers.get('location') || '';
    const dead = res.status >= 300 && res.status < 400 && /login|signin|passport/i.test(loc);
    return { alive: !dead && res.status >= 200 && res.status < 400, dead, setCookies, status: res.status, loc };
  } catch (e) {
    return { alive: false, dead: false, netError: true, setCookies: [], status: undefined, loc: '', note: `probe network: ${String(e).slice(0, 60)}` };
  }
}

async function probePartner(cookie) {
  // API 级探活为准（HTML 页面 200 但客户端跳登录会假阳性）；页面 GET 保留用于会话续期
  try {
    const res = await fetch('https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Cookie: cookie || '',
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://partner.xiaohongshu.com',
        Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
      },
      body: JSON.stringify({ reportCode: '', viewAlias: 'partner_customerManage_monitorAssistant_vsellerMonitorView', chart: 'virtual_seller', dynamicTargets: ['virtual_seller_id', 'virtual_seller_name'], pageNum: 1, pageSize: 1 }),
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const dead = res.status === 401 || res.status === 403;
    return { alive: !dead && res.status >= 200 && res.status < 300, dead, setCookies, status: res.status, loc: res.headers.get('location') || '' };
  } catch (e) {
    return { alive: false, dead: false, setCookies: [], status: undefined, loc: '', note: `api probe error: ${String(e).slice(0, 60)}` };
  }
}

async function probeMcc(cookie) {
  return probeUrl('https://mcc.xiaohongshu.com/micro/aurora-data', cookie);
}

/** partner 无头账密重登（滑块出现则失败 → need_manual_login） */
async function reloginPartner(brandId) {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  try {
    const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId } });
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1440, height: 860 } });
    if (cfg?.cookie) {
      await ctx.addCookies(cfg.cookie.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
    }
    const page = await ctx.newPage();
    await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);
    if (!/login|signin/i.test(page.url())) return { ok: true, cookie: cfg?.cookie || '', note: 'cookie 仍有效（无头页面未跳登录）' };
    const ACCOUNT = process.env.PARTNER_LOGIN_USER;
    const PASSWORD = process.env.PARTNER_LOGIN_PASS;
    if (!ACCOUNT || !PASSWORD) return { ok: false, note: '缺 PARTNER_LOGIN_USER/PASS' };
    try {
      const tab = page.locator('text=/账号登录/').first();
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); await sleep(600); }
      await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="邮箱"]').first().fill(ACCOUNT, { timeout: 8000 });
      await page.locator('input[type="password"]').first().fill(PASSWORD, { timeout: 8000 });
      await sleep(300);
      await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
    } catch (e) {
      return { ok: false, note: `自动填充失败（滑块/表单异常）: ${String(e).slice(0, 60)}` };
    }
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      if (!/login|signin/i.test(page.url())) {
        const stateJson = await ctx.storageState();
        const cookieStr = (stateJson.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
        return { ok: !!cookieStr, cookie: cookieStr, note: cookieStr ? '无头重登成功' : '重登成功但未取到 cookie' };
      }
    }
    return { ok: false, note: '重登等待超时（大概率滑块）→ need_manual_login' };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** mcc 账密重登（凭据 SPARK_ACCOUNT_B{brandId}/SPARK_PASSWORD_B{brandId}；/login 默认邮箱+密码表单） */
async function reloginMcc(brandId) {
  const ACCOUNT = process.env[`SPARK_ACCOUNT_B${brandId}`];
  const PASSWORD = process.env[`SPARK_PASSWORD_B${brandId}`];
  if (!ACCOUNT || !PASSWORD) return { ok: false, note: `缺 SPARK_ACCOUNT_B${brandId}/SPARK_PASSWORD_B${brandId}` };
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'] });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1440, height: 860 } });
    const page = await ctx.newPage();
    await page.goto('https://mcc.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(10000);
    // 完整重试流程：每轮 填表→勾协议→点登录→等 20s；共 3 轮（不依赖 disabled 属性判断，样式类按钮不可靠）
    let lastDebug = '';
    for (let round = 0; round < 3; round++) {
      await page.locator('input[placeholder="邮箱"]').first().fill(ACCOUNT, { timeout: 15000 });
      await page.locator('input[placeholder="密码"]').first().fill(PASSWORD, { timeout: 15000 });
      await sleep(300);
      // 勾选「我已阅读并同意用户协议和隐私条款」：点文案标签 + 页面内 JS 原生 click()（自定义样式组件不吃合成 check()）
      await page.locator('text=我已阅读并同意').first().click({ timeout: 5000 }).catch(() => {});
      await page.evaluate(() => {
        document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (!cb.checked) cb.click();
        });
      });
      await sleep(400);
      const cbs = page.locator('input[type="checkbox"]');
      lastDebug = `round${round + 1} 邮箱值=${(await page.locator('input[placeholder="邮箱"]').first().inputValue().catch(() => '?')).slice(0, 4)}*** 勾选=${await cbs.nth(0).isChecked().catch(() => '?')}/${await cbs.nth(1).isChecked().catch(() => '?')} dom=${await page.evaluate(() => { const cb = document.querySelector('input[type="checkbox"]'); return cb ? cb.outerHTML.slice(0, 80) : 'none'; })}`;
      await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click().catch(() => {});
      // 等最多 20s
      for (let i = 0; i < 6; i++) {
        await sleep(3000);
        if (!/login|passport/i.test(page.url())) {
          const stateJson = await ctx.storageState();
          const cookieStr = (stateJson.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
          return { ok: !!cookieStr, cookie: cookieStr, note: cookieStr ? 'mcc 无头重登成功' : 'mcc 重登成功但未取到 cookie' };
        }
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const errHit = bodyText.match(/密码错误|账号或密码|账号不存在|已被冻结|没有权限|权限不足|未开通/);
        if (errHit) return { ok: false, note: `mcc 登录被拒: ${errHit[0]}` };
        if (/拖动滑块|滑块验证|安全验证/.test(bodyText)) {
          await page.screenshot({ path: path.join(LOG_DIR, `mcc-b${brandId}-captcha.png`).replace(/\\/g, '/'), fullPage: false }).catch(() => {});
          return { ok: false, note: 'mcc 登录出现滑块/安全验证 → need_manual_login（截图见 state/）' };
        }
      }
    }
    // 超时：截图 + 文案快照辅助诊断
    const shot = path.join(LOG_DIR, `mcc-b${brandId}-timeout.png`).replace(/\\/g, '/');
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 120);
    return { ok: false, note: `mcc 重登等待超时；${lastDebug}; 页面片段: ${snippet}（截图 state/mcc-b${brandId}-timeout.png）` };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function keepBrand(org) {
  const brandId = org.brandId;
  const t0 = Date.now();
  const st = state[brandId] || (state[brandId] = { consecutiveFails: 0 });

  // 引导：无 cookie 但配置了账密 → 先尝试自动登录拿 cookie（mcc 引导登录）
  if (!org.cookie) {
    const ACCOUNT = process.env[`SPARK_ACCOUNT_B${brandId}`];
    const PASSWORD = process.env[`SPARK_PASSWORD_B${brandId}`];
    if (!ACCOUNT || !PASSWORD) return; // 无 cookie 无凭据，静默跳过
    const st2 = state[brandId];
    const cooldownMs = RELOGIN_COOLDOWN_MIN * 60000;
    if (st2.lastReloginAt && Date.now() - st2.lastReloginAt < cooldownMs) return;
    st2.lastReloginAt = Date.now();
    console.log(`[${nowIso()}] brand${brandId} 无 cookie，尝试 mcc 账密引导登录 ...`);
    let rr;
    try { rr = await reloginMcc(brandId); } catch (e) { rr = { ok: false, note: `bootstrap error: ${String(e).slice(0, 80)}` }; }
    if (rr.ok && rr.cookie) {
      await prisma.sparkOrgConfig.update({ where: { brandId }, data: { cookie: rr.cookie, lastSyncAt: new Date() } }).catch(() => {});
      org.cookie = rr.cookie;
      st2.consecutiveFails = 0;
      console.log(`[${nowIso()}] brand${brandId} 引导登录成功: ${rr.note}`);
      await prisma.sparkSyncLog.create({ data: { brandId, syncType: 'keepalive', statDate: nowIso().slice(0, 10), status: 'success', message: `bootstrap login ok: ${rr.note}` } }).catch(() => {});
    } else {
      console.log(`[${nowIso()}] brand${brandId} 引导登录失败: ${rr?.note}`);
      await prisma.sparkSyncLog.create({ data: { brandId, syncType: 'keepalive', statDate: nowIso().slice(0, 10), status: 'failed', message: `bootstrap login failed: ${rr?.note}` } }).catch(() => {});
    }
    return;
  }

  let r;
  try {
    r = org.channel === 'partner' ? await probePartner(org.cookie) : await probeMcc(org.cookie);
  } catch (e) {
    r = { alive: false, setCookies: [], note: `probe error: ${String(e).slice(0, 80)}` };
  }
  const latency = Date.now() - t0;

  // 续期：Set-Cookie 合并回写
  let cookieUpdated = false;
  if (r.setCookies?.length) {
    const merged = mergeCookies(org.cookie, r.setCookies);
    if (merged && merged !== org.cookie) {
      await prisma.sparkOrgConfig.update({ where: { brandId }, data: { cookie: merged } }).catch(() => {});
      org.cookie = merged;
      cookieUpdated = true;
    }
  }

  let status = r.alive ? 'success' : 'failed';
  let note = r.alive ? `${org.channel} alive` : r.netError ? `${org.channel} probe network timeout（不判定会话死亡）` : `${org.channel} session dead`;

  // 失效处理：仅真实会话死亡（非网络错误）触发自动重登，冷却 30 分钟
  if (!r.alive && !r.netError) {
    st.consecutiveFails = (st.consecutiveFails || 0) + 1;
    const cooldownMs = RELOGIN_COOLDOWN_MIN * 60000;
    const canTry = st.consecutiveFails >= 2 && (!st.lastReloginAt || Date.now() - st.lastReloginAt > cooldownMs);
    if (canTry) {
      st.lastReloginAt = Date.now();
      console.log(`[${nowIso()}] brand${brandId} 失效，尝试自动重登 (${org.channel}) ...`);
      let rr;
      try {
        rr = org.channel === 'partner' ? await reloginPartner(brandId) : await reloginMcc(brandId);
      } catch (e) {
        rr = { ok: false, note: `relogin error: ${String(e).slice(0, 80)}` };
      }
      if (rr.ok) {
        if (rr.cookie && rr.cookie !== org.cookie) {
          await prisma.sparkOrgConfig.update({ where: { brandId }, data: { cookie: rr.cookie } }).catch(() => {});
          org.cookie = rr.cookie;
        }
        await prisma.sparkOrgConfig.update({ where: { brandId }, data: { lastSyncAt: new Date() } }).catch(() => {});
        status = 'success';
        note = `${org.channel} relogin ok: ${rr.note}`;
        st.consecutiveFails = 0;
      } else {
        note = `${org.channel} relogin failed: ${rr.note}`;
      }
    }
  } else if (r.alive) {
    st.consecutiveFails = 0;
  }

  st.alive = status === 'success';
  st.lastOk = st.alive ? nowIso() : st.lastOk;
  st.lastFail = st.alive ? st.lastFail : nowIso();
  st.lastLatency = latency;
  saveState();

  await prisma.sparkSyncLog.create({
    data: {
      brandId,
      syncType: 'keepalive',
      statDate: nowIso().slice(0, 10),
      status,
      message: `${note}; ${latency}ms; http=${r.status}; cookieUpdated=${cookieUpdated}; fails=${st.consecutiveFails || 0}`,
    },
  }).catch(() => {});
  console.log(`[${nowIso()}] brand${brandId}(${org.channel}) ${status} ${latency}ms http=${r.status} ${note}`);
}

async function round() {
  const orgs = await prisma.sparkOrgConfig.findMany({ where: { active: true } });
  if (!orgs.length) { console.log(`[${nowIso()}] 无 active 组织可探活`); return; }
  for (const org of orgs) {
    try { await keepBrand(org); } catch (e) { console.error(`[${nowIso()}] brand${org.brandId} keep error: ${String(e).slice(0, 120)}`); }
    await sleep(3000);
  }
}

(async () => {
  loadState();
  console.log(`[${nowIso()}] keepalive daemon started, interval=${INTERVAL_MIN}min`);
  for (;;) {
    try { await round(); } catch (e) { console.error(`[${nowIso()}] round error: ${String(e).slice(0, 160)}`); }
    await sleep(INTERVAL_MIN * 60000);
  }
})();
