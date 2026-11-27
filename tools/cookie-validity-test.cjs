#!/usr/bin/env node
// MCC cookie 服务器侧有效性测试(b2/5/7/8):输出每品牌 http 状态 + ALIVE/DEAD。
// 退出码: 0=至少一个品牌 ALIVE; 1=全部 DEAD/出错。
const { createRequire } = require('module');
const path = require('path');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
// 家宽代理(2026-11-27): 本文件 fetch 均为 xiaohongshu 域名,统一走 MCC_PROXY_URL 代理
try { if (process.env.MCC_PROXY_URL) { const { ProxyAgent, setGlobalDispatcher } = backendRequire('undici'); setGlobalDispatcher(new ProxyAgent(process.env.MCC_PROXY_URL.trim())); } } catch {}
const p = new PrismaClient();
const mk = (l) => ({ selected: 1, labelValue: l, labelName: l });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
(async () => {
  let alive = 0;
  for (const b of [2, 5, 7, 8]) {
    const cfg = await p.sparkOrgConfig.findUnique({ where: { brandId: b } });
    let verdict;
    try {
      const r = await fetch('https://mcc.xiaohongshu.com/api/vision/mcc_dashboard/target_detail_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cfg.cookie, 'User-Agent': UA, Origin: 'https://mcc.xiaohongshu.com', Referer: 'https://mcc.xiaohongshu.com/micro/note-data' },
        body: JSON.stringify({ viewAlias: 'mcc_assets_creativityContent_noteAnalysisView', chart: 'noteList', sorts: [], dynamicTargets: ['note_id'], page: { pageNo: 1, pageSize: 5 }, frontFilterList: [{ filterField: 'time_dim', filterFieldName: '时间维度', filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [mk('all_key')] } }] }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json().catch(() => null);
      const ok = j?.code === 0 || j?.success === true;
      if (ok) alive++;
      verdict = `${r.status} ${ok ? 'ALIVE' : 'DEAD(' + ((j?.msg || '').slice(0, 15)) + ')'}`;
    } catch (e) { verdict = 'ERR ' + e.message.slice(0, 30); }
    console.log(`b${b}: ${verdict}`);
  }
  await p.$disconnect();
  process.exit(alive ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
