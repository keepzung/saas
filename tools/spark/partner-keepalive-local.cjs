#!/usr/bin/env node
// partner 会话本地保活 (特斯拉 brand6): 本机持久化 profile 静默刷新会话 → 探活验证 → SSH 推生产库
// 背景: partner cookie 周期性失效, 服务器端自动重登被滑块拦截; 本机真实 IP + 常驻 profile 风控友好,
//   会话活着时刷新全程无感。会话真死时: 静默模式 exit 2 (由每日 10:00 巡检日报提示),
//   人工处理: node partner-keepalive-local.cjs --interactive  (弹窗登录一次, 之后恢复静默)
// 用法:
//   node partner-keepalive-local.cjs                 # 静默: 活→推 cookie+触发同步; 死→exit 2
//   node partner-keepalive-local.cjs --interactive   # 死会话时弹窗等人工登录(≤12 分钟)
//   node partner-keepalive-local.cjs --dry           # 只验证, 不推不触发同步
// 可覆盖项: PARTNER_SSH_HOST (默认 root@119.28.157.150), BRAND_ID (默认 6)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PROFILE_DIR = path.join(ROOT, 'local-profile', 'partner');
const SEED_STATE = path.join(ROOT, 'state', 'partner-state-latest.json');
const LOG_FILE = path.join(ROOT, 'keepalive-local.log');
const SSH_HOST = process.env.PARTNER_SSH_HOST || 'root@119.28.157.150';
const BRAND_ID = Number(process.env.BRAND_ID || 6);
const DASHBOARD = 'https://partner.xiaohongshu.com/partner/watch-dashboard';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const interactive = process.argv.includes('--interactive');
const dry = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => {
  const line = `${new Date().toISOString()} ${a.join(' ')}`;
  console.log(line);
};

// 日志超 256KB 截尾, 防计划任务长期写爆
function trimLog() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 256 * 1024) {
      const tail = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).slice(-400).join('\n');
      fs.writeFileSync(LOG_FILE, tail);
    }
  } catch {}
}

function extractCookie(cookies) {
  return cookies
    .filter((c) => /xiaohongshu\.com$/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

// 本机直连探活: 401/403 或 code=902 判死; 200 且非登录态即视为活 (10101 限流也算活)
async function probeAlive(cookieStr) {
  try {
    const res = await fetch('https://partner.xiaohongshu.com/api/vision/dashboard/target_detail_list', {
      method: 'POST',
      headers: {
        Cookie: cookieStr,
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://partner.xiaohongshu.com',
        Referer: 'https://partner.xiaohongshu.com/partner/watch-dashboard',
      },
      body: JSON.stringify({
        reportCode: '',
        viewAlias: 'partner_customerManage_monitorAssistant_vsellerMonitorView',
        chart: 'virtual_seller',
        dynamicTargets: ['virtual_seller_id'],
        page: { pageNo: 1, pageSize: 1 },
        frontFilterList: [],
        compFrontFilterList: [],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403 || j.code === 902) {
      return { alive: false, brief: `http=${res.status} code=${j.code}` };
    }
    if (/login|signin/i.test(res.url || '')) return { alive: false, brief: 'redirect login' };
    return { alive: true, brief: `http=${res.status} code=${j.code}` };
  } catch (e) {
    return { alive: null, brief: `network ${String(e.message).slice(0, 60)}` };
  }
}

async function main() {
  trimLog();
  log(`[keepalive-local] 启动 mode=${interactive ? 'interactive' : dry ? 'dry' : 'silent'}`);
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !interactive,
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1600, height: 900 },
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  try {
    // 首次引导: profile 无 cookie 时, 用既有 storageState 种入, 免去重新扫码/登录
    if (!(await ctx.cookies()).some((c) => /xiaohongshu\.com$/.test(c.domain)) && fs.existsSync(SEED_STATE)) {
      const seed = JSON.parse(fs.readFileSync(SEED_STATE, 'utf8'));
      const list = (seed.cookies || []).map((c) => ({ ...c, expires: c.expires > 0 ? c.expires : -1 }));
      if (list.length) {
        await ctx.addCookies(list);
        log(`[keepalive-local] 已从 ${path.basename(SEED_STATE)} 种入 ${list.length} 条 cookie`);
      }
    }
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);

    const isLoginUrl = () => /login|signin/i.test(page.url());
    if (interactive && isLoginUrl()) {
      log('[keepalive-local] 会话已死, 请在弹出窗口完成登录 (账密+滑块, 最长等 12 分钟)...');
      for (let i = 0; i < 240; i++) {
        await sleep(3000);
        if (!isLoginUrl()) break;
        if (i % 20 === 19) log(`[keepalive-local] 等待人工登录... (${(i + 1) * 3}s)`);
      }
      await sleep(4000);
    }

    let cookieStr = extractCookie(await ctx.cookies());
    let probe = await probeAlive(cookieStr);
    if (probe.alive === false && interactive && isLoginUrl()) {
      // 再给一轮机会 (登录完成但页面跳转慢)
      cookieStr = extractCookie(await ctx.cookies());
      probe = await probeAlive(cookieStr);
    }
    log(`[keepalive-local] 探活: ${probe.brief}`);

    if (probe.alive === null) {
      await ctx.close();
      process.exit(3); // 网络异常, 不判死不推送
    }
    if (probe.alive === false) {
      log('[keepalive-local] 会话已死。静默模式不处理; 请执行: node partner-keepalive-local.cjs --interactive');
      await ctx.close();
      process.exit(2);
    }

    if (dry) {
      log(`[keepalive-local] 验证通过 (dry, 未推送), cookie ${cookieStr.length} 字节`);
      await ctx.close();
      return;
    }

    // SSH 推送生产库 (cookie 走 stdin, 不落盘)
    const push = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, `node /opt/saas/tools/spark/push-partner-cookie.cjs ${BRAND_ID}`],
      { input: cookieStr, encoding: 'utf8', timeout: 60000 },
    );
    if (push.status !== 0) {
      log('[keepalive-local] 推送失败:', String(push.stderr || '').slice(0, 200));
      await ctx.close();
      process.exit(1);
    }
    log('[keepalive-local] 推送成功:', String(push.stdout || '').trim().slice(0, 200));

    // 顺手触发一次同步 (失败不影响保活本身)
    const sync = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', SSH_HOST, 'cd /opt/saas/tools && node trigger-sync.cjs all 6'],
      { encoding: 'utf8', timeout: 240000 },
    );
    log(`[keepalive-local] 同步触发: ${sync.status === 0 ? 'ok' : `rc=${sync.status}`}`);
    await ctx.close();
    process.exit(0);
  } catch (e) {
    log('[keepalive-local] 异常:', String(e.message).slice(0, 200));
    try { await ctx.close(); } catch {}
    process.exit(1);
  }
}

main();
