#!/usr/bin/env node
/* MDD 探针：线索管理视图族是否返回「来源笔记」+ 手机号字段
 * 用法: NODE_PATH=/opt/saas/backend/node_modules node mdd-clue-source-note-probe.cjs [start] [end]
 * 依赖 SparkOrgConfig(brandId=5) cookie 有效，失效报 code=902。只读查询，不写任何数据。
 * 结论口径：①config 枚举出 note/phone 相关指标码 ②明细行实际字段。决定笔记级成交归因能否做实。 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'https://mcc.xiaohongshu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ARG_START = process.argv[2] || new Date(Date.now() - 8 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const ARG_END = process.argv[3] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

const H = async () => {
  const org = await p.sparkOrgConfig.findFirst({ where: { brandId: 5, active: true } });
  if (!org?.cookie) throw new Error('SparkOrgConfig(brandId=5) cookie 为空');
  return { 'Content-Type': 'application/json', Cookie: org.cookie, 'User-Agent': UA, Origin: BASE, Referer: `${BASE}/micro/clues-data`, 'Accept-Language': 'zh-CN,zh;q=0.9' };
};

const callPath = async (h, path, body) => {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const j = await res.json().catch(() => null);
  if (!j) return { httpError: res.status };
  if (j.code !== 0 && j.success !== true) return { apiError: `code=${j.code} msg=${j.msg ?? j.message}` };
  return j.data ?? {};
};

/** 枚举视图全部指标码 */
async function probeConfig(h, viewAlias) {
  const data = await callPath(h, '/api/vision/mcc_dashboard/target_config_list', { viewAlias, chart: '', bizCode: 'mcc_assets_clueManage' });
  if (data.httpError || data.apiError) return { viewAlias, ...data };
  const codes = [];
  const names = new Map();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'targetCode' && typeof v === 'string') codes.push(v);
      if (k === 'targetName' && typeof v === 'string') names.set(v, 1);
      if (['targetVos', 'targetList', 'children', 'list', 'items', 'dimensionTargets', 'metricTargets'].includes(k)) walk(v);
    }
  };
  walk(data);
  return { viewAlias, codes: [...new Set(codes)], total: codes.length };
}

/** 试探视图明细行 */
async function probeRows(h, viewAlias, targets) {
  const body = {
    viewAlias,
    dynamicTargets: targets,
    sorts: [],
    page: { pageNo: 1, pageSize: 5 },
    frontFilterList: [
      { hide: 0, foldType: 0, require: 1, filterField: 'date_key', filterFieldName: '线索生成时间', filterType: 10, timeFilter: { disableRange: 0, limitMax: 366, quickDates: [6, 11, 16, 21, 36, 41, 46, 51], values: [ARG_START, ARG_END], pattern: 10, timeShowType: 11 } },
      { filterType: 20, selectFilter: { selectType: 10, selectShowType: 0, valueSource: 0, selectLabels: [{ labelValue: 'all_key', labelName: '合计', selected: 1 }, { selected: 0, labelValue: 'date_key', labelName: '按天' }] }, hide: 0, foldType: 0, require: 1, filterField: 'time_dim', filterFieldName: '时间维度' },
    ],
  };
  const data = await callPath(h, '/api/vision/mcc_dashboard/target_detail_list', body);
  if (data.httpError || data.apiError) return { viewAlias, ...data };
  const vo = data.detailListVo ?? {};
  const rows = vo.detailVoList ?? vo.detailDataList ?? [];
  const fields = new Set();
  const dump = [];
  for (const r of rows.slice(0, 3)) {
    const list = Array.isArray(r.targetList) ? r.targetList : Array.isArray(r.targetVos) ? r.targetVos : [];
    const m = {};
    for (const t of list) {
      if (t.targetCode) fields.add(t.targetCode);
      m[t.targetCode] = t.targetValue ?? t.targetOriginValue ?? null;
    }
    for (const k of Object.keys(r)) if (!['targetList', 'targetVos'].includes(k)) m[k] = typeof r[k] === 'object' ? JSON.stringify(r[k]).slice(0, 120) : r[k];
    dump.push(m);
  }
  return { viewAlias, total: vo.total ?? 0, rowCount: rows.length, fields: [...fields], dump };
}

(async () => {
  const h = await H();
  console.log('窗口:', ARG_START, '~', ARG_END);

  // ── 1) 已知两个线索视图的指标码全集（找 note/phone 相关码）──
  for (const va of ['mcc_assets_clueManage_clueAnalysisListView', 'mcc_assets_clueManage_customerAcquisitionView']) {
    const r = await probeConfig(h, va);
    if (r.codes) {
      const hit = r.codes.filter((c) => /note|phone|mobile|tel|remark|memo/i.test(c));
      console.log(`\n[config] ${va}: ${r.total} 码`);
      console.log('  note/phone 相关码:', hit.length ? hit.join(', ') : '(无)');
      console.log('  全部维度/指标码:', r.codes.join(', '));
    } else {
      console.log(`\n[config] ${va}: 不可用`, JSON.stringify(r));
    }
  }

  // ── 2) 试探线索管理下可能存在的「线索列表/线索用户」视图 ──
  const candidates = [
    'mcc_assets_clueManage_clueListView',
    'mcc_assets_clueManage_clueList',
    'mcc_assets_clueManage_clueUserView',
    'mcc_assets_clueManage_clueUserListView',
    'mcc_assets_clueManage_userListView',
    'mcc_assets_clueManage_clueDetailView',
    'mcc_assets_clueManage_clueManageListView',
    'mcc_assets_clueManage_leadsListView',
  ];
  const alive = [];
  for (const va of candidates) {
    const r = await probeConfig(h, va);
    const ok2 = Array.isArray(r.codes) && r.codes.length > 0;
    console.log(`\n[试探] ${va}: ${ok2 ? `存在，${r.codes.length} 码` : JSON.stringify(r.apiError ?? r.httpError ?? '空')}`);
    if (ok2) {
      alive.push(va);
      const hit = r.codes.filter((c) => /note|phone|mobile|tel/i.test(c));
      console.log('  note/phone 相关码:', hit.length ? hit.join(', ') : '(无)');
      console.log('  全部码:', r.codes.join(', '));
    }
  }

  // ── 3) 对存在的视图拉明细行 dump 实际字段 ──
  for (const va of alive) {
    const cfg = await probeConfig(h, va);
    const targets = cfg.codes.filter((c) => /note|phone|mobile|tel|clue|user|name|date|source/i.test(c)).slice(0, 30);
    const r = await probeRows(h, va, targets.length ? targets : cfg.codes.slice(0, 20));
    console.log(`\n[明细] ${va}: total=${r.total ?? '-'} rowCount=${r.rowCount ?? '-'}`);
    if (r.fields) {
      console.log('  行字段:', r.fields.join(', '));
      const interesting = r.fields.filter((c) => /note|phone|mobile|tel/i.test(c));
      console.log('  ★ 来源笔记/手机号字段:', interesting.length ? interesting.join(', ') : '(未发现)');
      for (const m of r.dump ?? []) console.log('  行样例:', JSON.stringify(m).slice(0, 500));
    } else {
      console.log('  ', JSON.stringify(r).slice(0, 300));
    }
  }

  console.log('\nPROBE DONE');
  await p.$disconnect();
})().catch((e) => { console.error('probe error:', String(e).slice(0, 400)); process.exitCode = 1; });
