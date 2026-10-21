#!/usr/bin/env node
// 半自动辅助登录（图片点选验证码由人工/AI 远程识别）：assist-login.cjs <mcc|partner> <brandId>
// 流程：有头(Xvfb) 打开登录页 → 复用 keepalive 填表提交 → 监测「安全验证」：
//   截图 state/assist-b{id}-captcha.png + 元数据 -meta.json → 轮询 -answer.json（click_xy 像素坐标）→ 点击 → 点「验证」
// 成功：cookie 写回 SparkOrgConfig(brandId) + lastSyncAt；结果写 -result.json
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, 'backend');
const backendRequire = createRequire(path.join(BACKEND, 'noop.js'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = backendRequire('playwright-core')); }
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

const envPath = path.join(BACKEND, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const channel = process.argv[2];
const brandId = Number(process.argv[3]);
if (!['mcc', 'partner'].includes(channel) || !brandId) {
  console.error('用法: node assist-login.cjs <mcc|partner> <brandId>');
  process.exit(2);
}
const TAG = `b${brandId}`;
const DIR = path.join(__dirname, 'state');
fs.mkdirSync(DIR, { recursive: true });
const F = {
  shot: path.join(DIR, `assist-${TAG}-captcha.png`),
  meta: path.join(DIR, `assist-${TAG}-meta.json`),
  answer: path.join(DIR, `assist-${TAG}-answer.json`),
  result: path.join(DIR, `assist-${TAG}-result.json`),
  page: path.join(DIR, `assist-${TAG}-page.png`),
};
for (const k of ['meta', 'answer', 'result']) { try { fs.unlinkSync(F[k]); } catch {} }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const log = (s) => console.log(`[${nowIso()}] ${s}`);

function resolveChromium() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  try {
    const base = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs)
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome'])
        if (fs.existsSync(path.join(base, d, sub))) return path.join(base, d, sub);
  } catch {}
  return undefined;
}

let xvfbProc = null;
function ensureXvfb() {
  if (process.env.DISPLAY) return process.env.DISPLAY;
  try { process.kill(0, 0); } catch {}
  const { execSync } = require('child_process');
  try { execSync('pgrep -x Xvfb'); } catch {
    xvfbProc = spawn('Xvfb', [':99', '-screen', '0', '1440x860x24'], { stdio: 'ignore', detached: true });
    xvfbProc.on('exit', () => { xvfbProc = null; });
  }
  return ':99';
}

async function waitAnswer(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fs.existsSync(F.answer)) {
      try {
        const j = JSON.parse(fs.readFileSync(F.answer, 'utf8'));
        if (j && Array.isArray(j.click_xy)) return j;
      } catch {}
    }
    await sleep(1000);
  }
  return null;
}

(async () => {
  const CHROMIUM_BIN = resolveChromium();
  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROMIUM_BIN,
    env: { ...process.env, DISPLAY: ensureXvfb() },
    args: ['--no-proxy-server', '--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-gpu'],
  });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1440, height: 860 } });
    const page = await ctx.newPage();

    if (channel === 'mcc') {
      const ACCOUNT = process.env[`SPARK_ACCOUNT_B${brandId}`];
      const PASSWORD = process.env[`SPARK_PASSWORD_B${brandId}`];
      if (!ACCOUNT || !PASSWORD) throw new Error(`缺 SPARK_ACCOUNT_B${brandId}/SPARK_PASSWORD_B${brandId}`);
      await page.goto('https://mcc.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(6000);
      await page.locator('input[placeholder="邮箱"]').first().fill(ACCOUNT, { timeout: 15000 });
      await page.locator('input[placeholder="密码"]').first().fill(PASSWORD, { timeout: 15000 });
      await sleep(300);
      await page.locator('text=我已阅读并同意').first().click({ timeout: 5000 }).catch(() => {});
      await page.evaluate(() => {
        document.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (!cb.checked) cb.click(); });
      });
      await sleep(400);
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').replace(/\s+/g, '') === '登录' && /beer-login-btn/.test(b.className));
        if (el) el.click();
      }).catch(() => {});
      await sleep(1500);
      await page.locator('input[placeholder="密码"]').first().press('Enter').catch(() => {});
    } else {
      const cfg = await prisma.sparkOrgConfig.findUnique({ where: { brandId } });
      if (cfg?.cookie) {
        await ctx.addCookies(cfg.cookie.split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: '.xiaohongshu.com', path: '/' })));
      }
      const ACCOUNT = process.env.PARTNER_LOGIN_USER;
      const PASSWORD = process.env.PARTNER_LOGIN_PASS;
      if (!ACCOUNT || !PASSWORD) throw new Error('缺 PARTNER_LOGIN_USER/PASS');
      await page.goto('https://partner.xiaohongshu.com/partner/watch-dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(6000);
      if (/login|signin/i.test(page.url())) {
        await page.locator('input[placeholder="请输入邮箱"]').first().fill(ACCOUNT, { timeout: 15000 });
        await page.locator('input[placeholder="请输入密码"]').first().fill(PASSWORD, { timeout: 15000 });
        await sleep(300);
        await page.evaluate(() => {
          document.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (!cb.checked) cb.click(); });
        });
        await sleep(400);
        await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click();
      }
    }
    log('登录表单已提交，开始监测验证/结果 ...');

    let captchaRounds = 0;
    for (let round = 0; round < 40; round++) {
      const url = page.url();
      if (!/login|signin|passport/i.test(url)) {
        const stateJson = await ctx.storageState();
        const cookieStr = (stateJson.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
        if (cookieStr) {
          await prisma.sparkOrgConfig.update({ where: { brandId }, data: { cookie: cookieStr, lastSyncAt: new Date() } }).catch((e) => log(`cookie 写库失败: ${e.message}`));
          const out = { ok: true, brandId, channel, cookie_len: cookieStr.length, note: `登录成功（经 ${captchaRounds} 轮验证码）` };
          fs.writeFileSync(F.result, JSON.stringify(out));
          log(JSON.stringify(out));
          return;
        }
      }
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const errHit = bodyText.match(/密码错误|账号或密码|账号不存在|已被冻结|没有权限|权限不足|未开通/);
      if (errHit) {
        await page.screenshot({ path: F.page }).catch(() => {});
        const out = { ok: false, brandId, channel, note: `登录被拒: ${errHit[0]}` };
        fs.writeFileSync(F.result, JSON.stringify(out));
        log(JSON.stringify(out));
        return;
      }
      if (/安全验证|拖动滑块|滑块验证/.test(bodyText)) {
        captchaRounds += 1;
        log(`检测到安全验证（第 ${captchaRounds} 轮），截图等待答案 ...`);
        await sleep(1800);
        try { fs.unlinkSync(F.answer); } catch {}
        await page.screenshot({ path: F.shot, fullPage: false });
        // 验证弹窗 DOM：xhsCaptcha_grid-item__img_* 六宫格 + 题目文本（渲染慢时重试）
        let capInfo = { cells: [], topic: '', hasVerifyBtn: false };
        for (let probe = 0; probe < 6 && !capInfo.cells.length; probe++) {
          await sleep(1500);
          capInfo = await page.evaluate(() => {
            const cells = [];
            for (const im of document.querySelectorAll('img[class*="xhsCaptcha_grid-item__img"]')) {
              const r = im.getBoundingClientRect();
              if (r.width > 40 && r.height > 40) {
                cells.push({ rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], src: (im.src || '').slice(0, 120) });
              }
            }
            cells.sort((a, b) => {
              const ay = a.rect[1], by = b.rect[1];
              if (Math.abs(ay - by) > 40) return ay - by;
              return a.rect[0] - b.rect[0];
            });
            const bodyTxt = document.body.innerText || '';
            const topic = (bodyTxt.match(/请选择最符合描述的[^\n]*\n+([^\n]+)/) || [])[1] || '';
            return { cells, topic: topic.trim(), hasVerifyBtn: !![...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '验证') };
          }).catch(() => ({ cells: [], topic: '', hasVerifyBtn: false }));
        }
        const cellImgs = [];
        for (let ci = 0; ci < capInfo.cells.length; ci++) {
          const c = capInfo.cells[ci];
          const p = path.join(DIR, `assist-${TAG}-cell${ci}.png`);
          try { await (await page.locator(`img[class*="xhsCaptcha_grid-item__img"]`).nth(ci)).screenshot({ path: p }); cellImgs.push(p); } catch {}
        }
        const promptMatch = bodyText.match(/请选择[^\n\r]{0,60}/);
        const topicMatch = bodyText.match(/(当前题目[：:]\s*)?([^\n\r]{2,20})\n\s*请选择/) ;
        fs.writeFileSync(F.meta, JSON.stringify({
          at: Date.now(), round: captchaRounds, channel, brandId,
          viewport: [1440, 860],
          prompt: promptMatch ? promptMatch[0] : '',
          topic: capInfo.topic || (topicMatch ? topicMatch[2] : ''),
          cells: capInfo.cells.map((c) => c.rect),
          cell_imgs: cellImgs.map((p) => path.basename(p)),
          cell_srcs: capInfo.cells.map((c) => c.src),
          body_sample: bodyText.replace(/\s+/g, ' ').slice(0, 200),
        }, null, 2));
        const ans = await waitAnswer(240000);
        if (!ans) { log('240s 无答案，刷新重试'); continue; }
        // 答案格式：cells=[0,3] 六宫格索引（与 meta.cells/cell_imgs 顺序一致）
        let pts = [];
        if (Array.isArray(ans.cells) && ans.cells.length) {
          pts = ans.cells.map((i) => {
            const c = capInfo.cells[i];
            return c ? [c.rect[0] + c.rect[2] / 2, c.rect[1] + c.rect[3] / 2] : null;
          }).filter(Boolean);
        } else if (Array.isArray(ans.click_xy)) {
          pts = ans.click_xy;
        }
        log(`收到答案: ${JSON.stringify(pts)}`);
        for (const [x, y] of pts) {
          await page.mouse.click(Number(x), Number(y));
          await sleep(350 + Math.random() * 350);
        }
        await sleep(500);
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '验证');
          if (el) el.click();
        }).catch(() => {});
        await sleep(3500);
        continue;
      }
      await sleep(2000);
    }
    await page.screenshot({ path: F.page }).catch(() => {});
    const out = { ok: false, brandId, channel, note: `等待超时（经 ${captchaRounds} 轮验证码未成功），终态截图 assist-${TAG}-page.png` };
    fs.writeFileSync(F.result, JSON.stringify(out));
    log(JSON.stringify(out));
  } finally {
    await browser.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
})().catch(async (e) => {
  const out = { ok: false, brandId, channel, note: `脚本异常: ${String(e).slice(0, 200)}` };
  try { fs.writeFileSync(F.result, JSON.stringify(out)); } catch {}
  console.error(String(e));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
