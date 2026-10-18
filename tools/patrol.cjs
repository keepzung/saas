// 数据源巡检引擎 — 由 tools/patrol-manifest.yaml 清单驱动 (manifest → 引擎分离)
// 四层检查: L1 登录态探活 → L2 接口结构断言 → L3 数据新鲜度 → L4 基线合理性
// 用法:
//   node patrol.cjs                          # 全量巡检, 控制台表格 + 落盘 md/json
//   node patrol.cjs --push                   # 有异常时推送企业微信 (读 backend/.env WECOM_WEBHOOK_URL)
//   node patrol.cjs --json                   # 仅输出 JSON
//   node patrol.cjs --only spark_mcc,laigu   # 只巡检指定源
//   node patrol.cjs --brand 6                # 只巡检指定品牌
//   BACKEND_DIR=/path/to/backend node patrol.cjs   # 后端目录与默认(../backend)不同时
// 退出码: 0=全部正常, 1=存在异常, 2=引擎自身失败 (可接 cron/pm2 告警)
// 需要 Node 18+ (原生 fetch); 在能连通生产库的环境运行 (服务器或 SSH 隧道)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const yaml = backendRequire('js-yaml');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = loadEnv(path.join(BACKEND_DIR, '.env'));
if (ENV.DATABASE_URL) process.env.DATABASE_URL = ENV.DATABASE_URL;

// ── 上海时区日期工具 (数据按自然日归档, 统一按 UTC+8 口径判断"昨天") ────────
const SH_OFFSET = 8 * 3600_000;
function shDayStr(d) {
  return new Date(d.getTime() + SH_OFFSET).toISOString().slice(0, 10);
}
function shDateTime(d) {
  if (!d) return '—';
  const s = new Date(d.getTime() + SH_OFFSET).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)}`;
}
function winUTC(dayStr) {
  return new Date(`${dayStr}T00:00:00.000Z`);
}

// ── 通用小件 ──────────────────────────────────────────────────────────────
function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function evalOp(v, rule) {
  if (rule.equals !== undefined) return v === rule.equals;
  if (rule.not_equals !== undefined) return v !== rule.not_equals;
  if (rule.regex) return new RegExp(rule.regex, rule.flags || '').test(String(v ?? ''));
  if (rule.contains !== undefined) return String(v ?? '').includes(rule.contains);
  if (rule.not_exists) return v == null;
  return v !== undefined && v !== null; // 无算子 → 仅要求存在
}
function matchRule(rule, probe) {
  if (rule.status_in && !rule.status_in.includes(probe.status)) return false;
  if (rule.redirect_regex) {
    const loc = probe.headers?.get?.('location') || '';
    if (
      !(
        probe.status >= 300 &&
        probe.status < 400 &&
        new RegExp(rule.redirect_regex, 'i').test(`${loc} ${probe.url || ''}`)
      )
    )
      return false;
  }
  if (rule.any_of) return rule.any_of.some((r) => matchRule(r, probe));
  if (rule.paths) {
    if (!rule.paths.some((p) => evalOp(getPath(probe.json, p), rule))) return false;
  } else if (rule.path !== undefined) {
    if (!evalOp(getPath(probe.json, rule.path), rule)) return false;
  }
  return true;
}
// 深度替换请求模板中的占位符: {cookie}/{orgCode}/{gatewayToken}/{baseUrl}/{yesterday}/{today}/{now}/{now_minus_hours:N}
function resolveTpl(v, ctx) {
  if (typeof v === 'string') {
    return v.replace(/\{([a-zA-Z_]+)(?::(\d+))?\}/g, (_m, key, arg) => {
      if (key === 'now') return new Date().toISOString();
      if (key === 'now_minus_hours') return new Date(Date.now() - Number(arg || 1) * 3600e3).toISOString();
      if (key === 'yesterday' || key === 'today') return ctx[key];
      if (ctx[key] === undefined || ctx[key] === null || ctx[key] === '')
        throw new Error(`清单占位符 {${key}} 无值 (brand ${ctx.brandId})`);
      return String(ctx[key]);
    });
  }
  if (Array.isArray(v)) return v.map((x) => resolveTpl(x, ctx));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = resolveTpl(v[k], ctx);
    return o;
  }
  return v;
}
const firstLower = (s) => s[0].toLowerCase() + s.slice(1);

async function main() {
  const args = new Set(process.argv.slice(2));
  const argVal = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : null;
  };
  const outJsonOnly = args.has('--json');
  const push = args.has('--push');
  const onlySrc = argVal('--only') ? argVal('--only').split(',') : null;
  const onlyBrand = argVal('--brand') ? Number(argVal('--brand')) : null;
  const manifestFile = argVal('--manifest') || path.join(__dirname, 'patrol-manifest.yaml');
  const manifest = yaml.load(fs.readFileSync(manifestFile, 'utf8'));
  const meta = manifest.meta || {};
  const HTTP = { timeout: meta.http?.超时ms ?? 15000, retries: meta.http?.重试 ?? 2, ua: meta.http?.ua ?? 'Mozilla/5.0', loginRe: meta.http?.登录跳转正则 ?? 'login|passport' };
  const SCAN_DAYS = meta.巡检窗口天数 ?? 9;
  const BASE_DAYS = meta.基线天数 ?? 7;
  const DROP_RATIO = meta.骤降阈值 ?? 0.3;
  const todayStr = shDayStr(new Date());
  const yestStr = shDayStr(new Date(Date.now() - 86400_000));
  const d8Str = shDayStr(new Date(Date.now() - (BASE_DAYS + 1) * 86400_000));
  const winStart = new Date(winUTC(d8Str).getTime() - 12 * 3600_000);
  const winEnd = new Date(Date.now() + 36 * 3600_000);

  const p = new PrismaClient();
  const M = (name) => {
    const m = p[firstLower(name)];
    if (!m) throw new Error(`清单引用了未知模型 ${name}`);
    return m;
  };

  const brands = await p.brand.findMany({ select: { id: true, name: true } });
  const brandName = (id) => {
    const b = brands.find((x) => x.id === id);
    if (b) return b.name.replace(/项目工作区$/, '') || `brand${id}`;
    return (manifest.brands && manifest.brands[id]) || `brand${id}`;
  };

  // ── HTTP 探测 (redirect: manual 以识别登录跳转; 网络错误重试) ────────────
  async function httpProbe(req, attempts) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP.timeout);
      try {
        const method = (req.method || 'GET').toUpperCase();
        const res = await fetch(req.url, {
          method,
          headers: req.headers,
          body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
          redirect: 'manual',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const text = await res.text().catch(() => '');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* 非 JSON 属于有效探测结果 */
        }
        return { status: res.status, url: res.url, headers: res.headers, json, text: text.slice(0, 400) };
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw lastErr;
  }

  // ── 判定: dead → ok → unknown ────────────────────────────────────────────
  function judge(probe, judgeSpec) {
    for (const r of judgeSpec?.dead || []) if (matchRule(r, probe)) return '失效';
    for (const r of judgeSpec?.ok || []) if (matchRule(r, probe)) return '有效';
    for (const r of judgeSpec?.unknown || []) if (matchRule(r, probe)) return '未知';
    return null;
  }
  const probeBrief = (probe) => {
    const j = probe.json || {};
    return `status=${probe.status} code=${j.code ?? '-'} msg=${String(j.msg ?? j.message ?? '').slice(0, 60)}`;
  };

  // ── L1: 登录态 ───────────────────────────────────────────────────────────
  async function runL1(spec, ctx) {
    const out = { cookie: '—', anomalies: [], probe: null };
    const l1 = spec.l1;
    if (!l1) return out;
    if (l1.type === 'http') {
      const credKey = spec.brands_from?.credential || (ctx.cookie !== undefined ? 'cookie' : 'gatewayToken');
      const credVal = String(ctx[credKey] ?? '').trim();
      if (!credVal) {
        out.cookie = '未配置';
        out.anomalies.push(`L1 ${credKey} 未配置`);
        return out;
      }
      try {
        const req = resolveTpl(l1.request, ctx);
        req.headers = { 'User-Agent': HTTP.ua, ...(req.headers || {}) };
        const probe = await httpProbe(req, HTTP.retries);
        out.probe = probe;
        const state = judge(probe, l1.judge);
        if (state === null) {
          out.cookie = '未知';
          out.anomalies.push(`L1 未命中判定规则: ${probeBrief(probe)}`);
        } else {
          out.cookie = state;
          if (state !== '有效') out.anomalies.push(`L1 ${probeBrief(probe)}`);
          else
            for (const w of l1.ok_warnings || [])
              if (evalOp(getPath(probe.json, w.path), { not_exists: w.not_exists }))
                out.anomalies.push(w.reason);
        }
      } catch (e) {
        out.cookie = '未知(网络)';
        out.anomalies.push(`L1 网络错误: ${String(e.message).slice(0, 80)}`);
      }
    } else if (l1.type === 'storage_state') {
      const raw = String(ctx[l1.field || 'storageState'] ?? '').trim();
      if (!raw) {
        out.cookie = '未配置';
        out.anomalies.push('L1 storageState 未配置');
        return out;
      }
      try {
        const st = JSON.parse(raw);
        const cookies = Array.isArray(st.cookies) ? st.cookies : [];
        const exps = cookies.map((c) => c.expires).filter((e) => typeof e === 'number' && e > 0);
        if (!cookies.length) {
          out.cookie = '疑似失效';
          out.anomalies.push('L1 storageState 无 cookies');
        } else if (!exps.length) {
          out.cookie = '疑似有效(静态)';
        } else {
          const maxExp = Math.max(...exps) * 1000;
          if (maxExp < Date.now()) {
            out.cookie = '失效(静态)';
            out.anomalies.push(`L1 cookie 已于 ${shDateTime(new Date(maxExp))} 过期`);
          } else if (maxExp < Date.now() + (l1.warn_within_hours ?? 72) * 3600_000) {
            out.cookie = '即将过期';
            out.anomalies.push(`L1 cookie 将于 ${shDateTime(new Date(maxExp))} 过期`);
          } else {
            out.cookie = '疑似有效(静态)';
          }
        }
      } catch {
        out.cookie = '损坏';
        out.anomalies.push('L1 storageState 非 JSON');
      }
    }
    return out;
  }

  // ── L2: 结构断言 ─────────────────────────────────────────────────────────
  async function runL2(items, ctx, l1Probe, cookieState) {
    const anomalies = [];
    for (const item of items || []) {
      let probe = l1Probe;
      try {
        if (cookieState !== '有效') continue; // 登录态已失效, 结构检查无意义 (含 reuse_probe)
        if (!item.reuse_probe) {
          const req = resolveTpl(item.request, ctx);
          req.headers = { 'User-Agent': HTTP.ua, ...(req.headers || {}) };
          probe = await httpProbe(req, HTTP.retries);
        }
        if (!probe) continue;
        const okEnv = probe.json && (probe.json.code === 0 || probe.json.success === true);
        if (!okEnv) {
          anomalies.push(`L2 响应异常 ${probeBrief(probe)}`);
          continue;
        }
        for (const path of item.must_exist || [])
          if (getPath(probe.json, path) === undefined)
            anomalies.push(item.must_exist_reason || `L2 缺字段 ${path}`);
        let rows = null;
        for (const lp of item.list_paths || []) {
          const v = getPath(probe.json, lp);
          if (Array.isArray(v)) {
            rows = v;
            break;
          }
        }
        if (item.list_paths && !Array.isArray(rows)) {
          anomalies.push(`L2 无 ${item.list_paths.join('/')} (疑似改版)`);
          continue;
        }
        if (rows && rows.length) {
          const row = rows[0] || {};
          if (item.item_array_field) {
            const list = item.item_array_field.map((f) => row[f]).find(Array.isArray);
            if (!list) {
              anomalies.push(`L2 行无 ${item.item_array_field.join('/')} (疑似改版)`);
              continue;
            }
            if (item.item_must_have_target_code && !list.some((t) => t.targetCode === item.item_must_have_target_code))
              anomalies.push(`L2 缺 ${item.item_must_have_target_code} 指标 (疑似口径改版)`);
          }
          for (const k of item.first_row_must_have || [])
            if (!(k in row)) anomalies.push(`L2 行缺 ${k} (疑似改版)`);
        }
      } catch (e) {
        anomalies.push(`L2 执行失败: ${String(e.message).slice(0, 80)}`);
      }
    }
    return anomalies;
  }

  // ── L3: 新鲜度 / L4: 基线 ────────────────────────────────────────────────
  async function lastSyncSuccess(brandId, syncTypes, sinceDays = 14) {
    if (!syncTypes?.length) return null;
    const log = await p.sparkSyncLog.findFirst({
      where: { brandId, syncType: { in: syncTypes }, status: 'success', createdAt: { gte: new Date(Date.now() - sinceDays * 86400_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return log?.createdAt ?? null;
  }
  async function lastSyncFailMsg(brandId, syncTypes, sinceDays = 14) {
    if (!syncTypes?.length) return null;
    const log = await p.sparkSyncLog.findFirst({
      where: { brandId, syncType: { in: syncTypes }, status: 'failed', createdAt: { gte: new Date(Date.now() - sinceDays * 86400_000) } },
      orderBy: { createdAt: 'desc' },
      select: { message: true, createdAt: true },
    });
    return log ? `${shDateTime(log.createdAt)} ${String(log.message || '').slice(0, 120)}` : null;
  }
  // 逐日值 → { maxDay, yestVal, baseAvg, verdict }
  function analyzeDaily(pairs) {
    if (!pairs.length) return { maxDay: null, yestVal: null, baseAvg: null, verdict: '近9天无数据' };
    const byDay = new Map();
    for (const { day, value } of pairs) {
      const k = shDayStr(day);
      byDay.set(k, (byDay.get(k) || 0) + value);
    }
    const maxDay = [...byDay.keys()].sort().pop();
    const yestVal = byDay.get(yestStr) ?? 0;
    const base = [];
    for (const [k, v] of byDay) if (k >= d8Str && k < yestStr) base.push(v);
    const baseAvg = base.length ? base.reduce((a, b) => a + b, 0) / base.length : null;
    let verdict = '正常';
    if (maxDay < yestStr) verdict = `最新数据停在 ${maxDay}`;
    else if (baseAvg !== null && baseAvg > 0 && yestVal === 0) verdict = '昨日归零';
    else if (baseAvg !== null && baseAvg > 0 && yestVal < baseAvg * DROP_RATIO) verdict = '较基线骤降';
    else if (baseAvg === null && maxDay >= yestStr) verdict = '无基线可比(新数据源)';
    return { maxDay, yestVal, baseAvg, verdict };
  }
  async function fetchDaily(model, dateField, valueField, brandId, where) {
    const select = { [dateField]: true };
    if (valueField) select[valueField] = true;
    const rows = await M(model).findMany({
      where: { brandId, [dateField]: { gte: winStart, lte: winEnd }, ...(where || {}) },
      select,
    });
    return rows.map((r) => ({ day: r[dateField], value: valueField ? Number(r[valueField] ?? 0) : 1 }));
  }

  // ── 品牌枚举 ─────────────────────────────────────────────────────────────
  async function enumerateBrands(spec) {
    const bf = spec.brands_from || {};
    if (bf.type === 'data_presence' || (!bf.table && bf.distinct)) {
      const rows = await M(bf.table).findMany({
        where: { [bf.date_field]: { gte: winStart, lte: winEnd } },
        select: { [bf.distinct]: true },
      });
      return [...new Set(rows.map((r) => r[bf.distinct]))].map((id) => ({ brandId: id, row: null }));
    }
    const rows = await M(bf.table).findMany({ where: bf.where || {}, orderBy: { brandId: 'asc' } });
    return rows.map((row) => ({ brandId: row.brandId, row }));
  }

  // ── 单源单品牌检查 ──────────────────────────────────────────────────────
  async function checkSource(id, spec) {
    const rows = [];
    for (const { brandId, row } of await enumerateBrands(spec)) {
      if (onlyBrand && brandId !== onlyBrand) continue;
      const ctx = { brandId, ...(row || {}), today: todayStr, yesterday: yestStr };
      const anomalies = [];
      const detail = {};
      const l1out = await runL1(spec, ctx);
      const cookie = spec.credential_note || l1out.cookie;
      if (!spec.credential_note) anomalies.push(...l1out.anomalies);
      else if (l1out.anomalies.length) anomalies.push(...l1out.anomalies.map((a) => a.replace(/^L1/, 'L1(凭源)')));

      anomalies.push(...(await runL2(spec.l2, ctx, l1out.probe, l1out.cookie)));

      // L3
      const l3 = spec.l3 || {};
      const syncAt = await lastSyncSuccess(brandId, l3.sync_log);
      const failMsg = await lastSyncFailMsg(brandId, l3.sync_log);
      const cfgDates = (l3.config_last_sync || [])
        .map((f) => (row ? row[f] : null))
        .filter((d) => d instanceof Date)
        .sort((a, b) => b - a);
      const lastSuccess = [syncAt, ...cfgDates].filter(Boolean).sort((a, b) => b - a)[0] || null;
      for (const f of l3.freshness || []) {
        const cnt = await M(f.model).count({
          where: { brandId, [f.date_field]: { gte: winStart, lte: winEnd }, ...(f.where || {}) },
        });
        if (cnt === 0) {
          const staleDays = f.zero_alert_if_sync_stale_days;
          const syncFresh = staleDays && lastSuccess && Date.now() - lastSuccess.getTime() < staleDays * 86400_000;
          if (!syncFresh) anomalies.push(`L3 ${f.label} 近${SCAN_DAYS}天无行`);
        }
        detail[`${f.label}近${SCAN_DAYS}天`] = cnt;
      }
      for (const f of l3.staleness || []) {
        const agg = await M(f.model).aggregate({
          where: { brandId, ...(f.where || {}) },
          _max: { [f.field]: true },
        });
        const maxAt = agg._max[f.field];
        if (maxAt && Date.now() - maxAt.getTime() > f.max_age_days * 86400_000)
          anomalies.push(`L3 ${f.label} ${shDateTime(maxAt)} 未再更新`);
      }
      for (const f of l3.info || []) {
        const agg = await M(f.model).aggregate({ where: { brandId }, _max: { [f.field]: true } });
        detail[f.label] = agg._max[f.field] ? shDateTime(agg._max[f.field]) : '—';
      }
      if (failMsg && l1out.cookie !== '有效') anomalies.push(`最近失败: ${failMsg}`);

      // L4
      let primary = null;
      for (const item of spec.l4 || []) {
        const a = analyzeDaily(await fetchDaily(item.model, item.date_field, item.value_field, brandId, item.where));
        if (!primary) primary = { item, a };
        const flagged =
          a.verdict === '近9天无数据' ||
          (a.verdict.startsWith('最新数据停在') && !item.no_stop_alert) ||
          (a.verdict === '昨日归零' && !(item.min_baseline && (a.baseAvg ?? 0) < item.min_baseline)) ||
          (a.verdict === '较基线骤降' && !item.only_zero);
        if (flagged) anomalies.push(`L3/L4 ${item.label} ${a.verdict}`);
      }
      if (primary) {
        detail['最新数据日'] = primary.a.maxDay ?? '无';
        detail[`昨日${primary.item.label}`] = primary.a.yestVal ?? '—';
        detail['基线日均'] = primary.a.baseAvg === null ? '—' : Math.round(primary.a.baseAvg * 100) / 100;
      }
      rows.push({ brand: brandName(brandId), source: id, cookie, lastSuccess: shDateTime(lastSuccess), anomalies: [...new Set(anomalies)], detail });
    }
    return rows;
  }

  // ── 执行全部启用的源 ─────────────────────────────────────────────────────
  const rows = [];
  for (const [id, spec] of Object.entries(manifest.sources || {})) {
    if (spec.enabled === false) continue;
    if (onlySrc && !onlySrc.includes(id)) continue;
    try {
      rows.push(...(await checkSource(id, spec)));
    } catch (e) {
      rows.push({ brand: '—', source: id, cookie: '—', lastSuccess: '—', anomalies: [`引擎执行失败: ${String(e.message).slice(0, 120)}`], detail: {} });
    }
  }
  await p.$disconnect();

  // ── 报告输出 ─────────────────────────────────────────────────────────────
  const badRows = rows.filter((r) => r.anomalies.length > 0);
  const disp = (s) => String(s ?? '');
  const width = (s) => [...disp(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  const pad = (s, n) => disp(s) + ' '.repeat(Math.max(0, n - width(s)));
  function renderTable(headers, dataRows) {
    const all = [headers, ...dataRows];
    const colW = headers.map((_h, i) => Math.min(60, Math.max(...all.map((r) => width(r[i] ?? '')))));
    const line = (r) => r.map((c, i) => pad(c, colW[i])).join(' | ');
    return [line(headers), colW.map((w) => '-'.repeat(w)).join('-|-'), ...dataRows.map(line)].join('\n');
  }
  const header = ['品牌', '来源', 'Cookie状态', '最后成功时间', '异常原因'];
  const labels = Object.fromEntries(Object.entries(manifest.sources || {}).map(([id, s]) => [id, s.label || id]));
  const tableRows = rows.map((r) => [
    disp(r.brand),
    labels[r.source] || r.source,
    disp(r.cookie),
    disp(r.lastSuccess),
    r.anomalies.length ? disp(r.anomalies.join('；')) : '—',
  ]);
  const detailHeaders = ['品牌', '来源', '最新数据日', '昨日值', '基线日均', '备注'];
  const detailRows = rows.map((r) => {
    const d = r.detail || {};
    const yestKey = Object.keys(d).find((k) => k.startsWith('昨日')) || '昨日值';
    const extra = Object.entries(d)
      .filter(([k]) => !['最新数据日', '基线日均', yestKey].includes(k))
      .map(([k, v]) => `${k}=${v}`);
    return [disp(r.brand), labels[r.source] || r.source, disp(d['最新数据日'] ?? '—'), disp(d[yestKey] ?? '—'), disp(d['基线日均'] ?? '—'), extra.join(' ') || '—'];
  });

  const ts = shDateTime(new Date()).replace(/[-: ]/g, '').slice(0, 12);
  const payload = { at: shDateTime(new Date()), manifest: path.basename(manifestFile), anomalies: badRows.length, rows };

  if (outJsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`\n小红书数据源巡检报告  ${payload.at}  (清单: ${path.basename(manifestFile)}, 异常行 ${badRows.length}/${rows.length})\n`);
    console.log(renderTable(header, tableRows));
    console.log(
      '注: 专业号KOS 的 Cookie状态为 storageState 静态检查 (shield 反爬无法裸探活); 在线验证请触发一次 POST /api/agency-api/pro/sync',
    );
    console.log('\nL3/L4 明细\n');
    console.log(renderTable(detailHeaders, detailRows));
    const reportDir = path.join(__dirname, meta.报告目录 || 'patrol-reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const md = [
      `# 小红书数据源巡检报告`,
      ``,
      `- 时间: ${payload.at}`,
      `- 清单: ${path.basename(manifestFile)}`,
      `- 异常行: ${badRows.length}/${rows.length}`,
      ``,
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...tableRows.map((r) => `| ${r.join(' | ')} |`),
      ``,
      `## L3/L4 明细`,
      ``,
      `| ${detailHeaders.join(' | ')} |`,
      `| ${detailHeaders.map(() => '---').join(' | ')} |`,
      ...detailRows.map((r) => `| ${r.join(' | ')} |`),
      ``,
      `> 注: 专业号KOS 的 Cookie状态为 storageState 静态检查（shield 反爬无法裸探活），在线验证请触发一次 POST /api/agency-api/pro/sync`,
      ``,
    ];
    const mdFile = path.join(reportDir, `patrol-${ts}.md`);
    fs.writeFileSync(mdFile, md.join('\n'), 'utf8');
    fs.writeFileSync(path.join(reportDir, `patrol-${ts}.json`), JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\n报告已落盘: ${mdFile}`);
  }

  if (push && badRows.length && ENV.WECOM_WEBHOOK_URL) {
    const md = [
      `**小红书数据源巡检异常 (${badRows.length}/${rows.length})**`,
      `巡检时间: ${payload.at}`,
      ...badRows.map((r) => `> ${r.brand} [${labels[r.source] || r.source}] ${r.cookie} | ${r.anomalies.join('；')}`),
    ].join('\n');
    try {
      await fetch(ENV.WECOM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md.slice(0, 4000) } }),
      });
      console.log('已推送企业微信告警');
    } catch (e) {
      console.error(`企业微信推送失败: ${e.message}`);
    }
  }

  process.exit(badRows.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`巡检引擎执行失败: ${e.message}`);
  process.exit(2);
});
