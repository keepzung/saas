#!/usr/bin/env node
// 灵感引擎·小红书本机抓取：本机真实 IP + 已扫码会话 搜索关键词 → SSH 推送生产库
// （服务器 IP 会触发小红书人机验证，搜索抓取只能在本机跑 —— 同"登录只在本机"纪律）
// 用法:
//   node xhs-local.cjs --brand 6 --keywords "特斯拉,Model Y"     # 手动指定词
//   node xhs-local.cjs --brand 6 --from-prod                     # 用生产库启用中的词表(xhs平台)
// 可选: --per-word N (每词入库上限,默认20) --no-push (只抓不推)
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const sparkRequire = createRequire(path.join(ROOT, 'tools', 'spark', 'package.json'));
const { chromium } = sparkRequire('playwright');

const STATE = path.join(__dirname, 'state', 'xhs-web.json');
const SSH_HOST = process.env.HOTSPOT_SSH_HOST || 'root@119.28.157.150';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SEARCH_API = '/api/sns/web/v1/search/notes';

const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : def;
};
const BRAND = Number(arg('--brand', 6));
const PER_WORD = Number(arg('--per-word', 20));
const NO_PUSH = argv.includes('--no-push');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 与后端 xhs.scraper 同款解析 ──────────────────────────────────────
const parseCount = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*(万|w|亿)?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] ?? '').toLowerCase();
  if (u === '万' || u === 'w') return Math.round(n * 10000);
  if (u === '亿') return Math.round(n * 100000000);
  return Math.round(n);
};
const normalizeUrl = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = s.replace(/^http:\/\//, 'https://');
  return /^https:\/\//.test(s) ? s : null;
};

function parseCards(items, keyword) {
  const out = [];
  for (const it of items ?? []) {
    const id = it.id || it.note_id;
    const card = it.note_card;
    if (!id || !card) continue;
    const cover =
      normalizeUrl(card.cover?.url) ??
      normalizeUrl(card.cover?.url_default) ??
      (Array.isArray(card.cover?.info_list) ? normalizeUrl(card.cover.info_list.at(-1)?.url) : null);
    out.push({
      platform: 'xhs',
      contentId: id,
      kind: card.type === 'video' ? 'video' : 'note',
      title: (card.display_title ?? '').trim().slice(0, 200),
      coverUrl: cover,
      authorId: card.user?.userid ?? card.user?.user_id ?? '',
      authorName: card.user?.nick_name ?? card.user?.nickname ?? '',
      authorAvatar: normalizeUrl(card.user?.avatar),
      likeCount: parseCount(card.interact_info?.liked_count),
      collectCount: parseCount(card.interact_info?.collected_count),
      commentCount: parseCount(card.interact_info?.comment_count),
      shareCount: parseCount(card.interact_info?.share_count),
      topics: Array.isArray(card.tag_items) ? card.tag_items.map((t) => t.name ?? '').filter(Boolean).slice(0, 10) : [],
      raw: { xsec_token: it.xsec_token ?? null, keyword },
    });
  }
  return out;
}

async function scrapeKeyword(page, keyword) {
  const collected = [];
  let blocked = false;
  const onResponse = (res) => {
    if (!res.url().includes(SEARCH_API)) return;
    res
      .json()
      .then((j) => {
        if (j?.code === -100 || j?.code === 461) {
          blocked = true;
          return;
        }
        collected.push(...parseCards(j?.data?.items, keyword));
      })
      .catch(() => {});
  };
  page.on('response', onResponse);
  try {
    await page.goto(
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await sleep(4500);
    if (page.url().includes('login') || page.url().includes('passport')) {
      console.error(`[xhs-local] 「${keyword}」跳转登录页，会话已过期 —— 重跑 login-xhs.cjs 扫码`);
      return { items: [], blocked: false, expired: true };
    }
  } finally {
    page.removeListener('response', onResponse);
  }
  return { items: collected.slice(0, PER_WORD), blocked, expired: false };
}

async function getKeywords() {
  const manual = arg('--keywords');
  if (manual) return manual.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const r = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, `node /opt/saas/tools/hotspot/list-keywords-server.cjs ${BRAND} xhs`],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (r.status !== 0) throw new Error(`拉取生产词表失败: ${String(r.stderr || '').slice(0, 150)}`);
  const line = String(r.stdout || '').split('\n').find((l) => l.trim().startsWith('['));
  return JSON.parse(line || '[]');
}

function pushToProd(keyword, items) {
  const payload = JSON.stringify({ keyword, items });
  const r = spawnSync(
    'ssh',
    [
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST,
      `node /opt/saas/tools/hotspot/import-hotspot-server.cjs ${BRAND} search`,
    ],
    { input: payload, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
  );
  const outLine = String(r.stdout || '').split('\n').filter(Boolean).pop() || '';
  if (r.status !== 0) {
    console.error(`[xhs-local] 推送失败 ${keyword}: ${String(r.stderr || '').slice(0, 150)}`);
    return null;
  }
  try {
    return JSON.parse(outLine);
  } catch {
    return null;
  }
}

(async () => {
  if (!fs.existsSync(STATE)) {
    console.error(`[xhs-local] 缺少 ${STATE}，先跑 node login-xhs.cjs 扫码`);
    process.exit(1);
  }
  const keywords = await getKeywords();
  if (!keywords.length) {
    console.log('[xhs-local] 无关键词可抓（--keywords 手动指定，或先在热点雷达页添加）');
    process.exit(0);
  }
  console.log(`[xhs-local] 品牌 ${BRAND}，${keywords.length} 个词：${keywords.join('、')}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(STATE, 'utf8')),
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  let total = 0;
  let expired = false;
  for (const kw of keywords) {
    const { items, blocked, expired: exp } = await scrapeKeyword(page, kw);
    if (exp) {
      expired = true;
      break;
    }
    if (blocked) {
      console.error(`[xhs-local] 「${kw}」搜索接口风控（-100/461），本词跳过，稍后再跑`);
      await sleep(15000);
      continue;
    }
    console.log(`[xhs-local] 「${kw}」抓到 ${items.length} 条`);
    total += items.length;
    if (items.length && !NO_PUSH) {
      const r = pushToProd(kw, items);
      console.log(`[xhs-local] 推送: ${JSON.stringify(r)}`);
    }
    await sleep(3500 + Math.floor(Math.random() * 2500));
  }
  await browser.close();
  console.log(`[xhs-local] 完成：共 ${total} 条${expired ? '（会话过期，中断）' : ''}`);
  process.exit(expired ? 2 : 0);
})().catch((e) => {
  console.error('[xhs-local]', e.message);
  process.exit(1);
});
