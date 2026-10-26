#!/usr/bin/env node
// 专业号会话本地保活 (特斯拉 brand6): 本机持久化 profile 静默刷新会话 → 探活验证 → SSH 推生产库
// 与 partner-keepalive-local.cjs 同款结构; 由同一个计划任务 (partner-keepalive.cmd) 先后调用
// 背景: 专业号线索页(/ads/api/clue/*)自 2026-10 起要求 ~24h 重新认证, KOS 数据接口不受影响;
//   本地每日两次刷新保证 09:00 的线索 cron 拿到新 storageState
// 会话真死时: 静默 exit 2; 人工: node pro-keepalive-local.cjs --interactive (弹窗登录, 扫码/账密均可)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PROFILE_DIR = path.join(ROOT, 'local-profile', 'pro');
const SEED_STATE = path.join(ROOT, 'state', 'auth-pro-manual.json');
const LOG_FILE = path.join(ROOT, 'keepalive-local.log');
const SSH_HOST = process.env.PARTNER_SSH_HOST || 'root@119.28.157.150';
const BRAND_ID = Number(process.env.BRAND_ID || 6);
const TARGET_URL = 'https://pro.xiaohongshu.com/enterprise/data/new-clue-management';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const interactive = process.argv.includes('--interactive');
const dry = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`${new Date().toISOString()} ${a.join(' ')}`);

function trimLog() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 256 * 1024) {
      const tail = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).slice(-400).join('\n');
      fs.writeFileSync(LOG_FILE, tail);
    }
  } catch {}
}

function extractStorage(cookies) {
  return cookies.filter((c) => /xiaohongshu\.com$/.test(c.domain));
}

// 本机直连探活: 线索页未登录会 302 到 /login; 200 即视为活
async function probeAlive(cookieStr) {
  try {
    const res = await fetch(TARGET_URL, {
      headers: { Cookie: cookieStr, 'User-Agent': UA },
      redirect: 'manual',
    });
    const loc = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && /login|passport/i.test(loc)) {
      return { alive: false, brief: `redirect ${res.status} -> ${loc.slice(0, 60)}` };
    }
    return { alive: true, brief: `http=${res.status}` };
  } catch (e) {
    return { alive: null, brief: `network ${String(e.message).slice(0, 60)}` };
  }
}

async function main() {
  trimLog();
  log(`[pro-keepalive] 启动 mode=${interactive ? 'interactive' : dry ? 'dry' : 'silent'}`);
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !interactive,
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1600, height: 900 },
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  try {
    if (!(await ctx.cookies()).some((c) => /xiaohongshu\.com$/.test(c.domain)) && fs.existsSync(SEED_STATE)) {
      const seed = JSON.parse(fs.readFileSync(SEED_STATE, 'utf8'));
      const list = (seed.cookies || []).map((c) => ({ ...c, expires: c.expires > 0 ? c.expires : -1 }));
      if (list.length) {
        await ctx.addCookies(list);
        log(`[pro-keepalive] 已从 ${path.basename(SEED_STATE)} 种入 ${list.length} 条 cookie`);
      }
    }
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);

    const isLoginUrl = () => /login|signin|passport/i.test(page.url());
    if (interactive && isLoginUrl()) {
      log('[pro-keepalive] 会话已死, 请在窗口完成登录 (扫码或账密, 最长等 10 分钟)...');
      for (let i = 0; i < 200; i++) {
        await sleep(3000);
        if (!isLoginUrl()) break;
        if (i % 20 === 19) log(`[pro-keepalive] 等待人工登录... (${(i + 1) * 3}s)`);
      }
      await sleep(4000);
    }

    let cookies = extractStorage(await ctx.cookies());
    let probe = await probeAlive(cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    log(`[pro-keepalive] 探活: ${probe.brief}`);

    if (probe.alive === null) {
      await ctx.close();
      process.exit(3);
    }
    if (probe.alive === false) {
      log('[pro-keepalive] 会话已死。静默模式不处理; 请执行: node pro-keepalive-local.cjs --interactive');
      await ctx.close();
      process.exit(2);
    }

    if (dry) {
      log(`[pro-keepalive] 验证通过 (dry, 未推送), ${cookies.length} cookies`);
      await ctx.close();
      return;
    }

    // storageState JSON 经 stdin 推生产库 ProOrgConfig(brandId)
    const stateJson = JSON.stringify(await ctx.storageState());
    const push = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, `node /opt/saas/tools/spark/push-pro-state-stdin.cjs ${BRAND_ID}`],
      { input: stateJson, encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
    );
    if (push.status !== 0) {
      log('[pro-keepalive] 推送失败:', String(push.stderr || '').slice(0, 200));
      await ctx.close();
      process.exit(1);
    }
    log('[pro-keepalive] 推送成功:', String(push.stdout || '').trim().slice(0, 150));
    await ctx.close();
    process.exit(0);
  } catch (e) {
    log('[pro-keepalive] 异常:', String(e.message).slice(0, 200));
    try { await ctx.close(); } catch {}
    process.exit(1);
  }
}

main();
