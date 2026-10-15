#!/usr/bin/env node
// Morgandada(5) 9月销售明细导入：9月dada小红书销售明细汇总.xlsx → /mdd/sales/import-orders
// 在服务器上执行（本机 3000 端口 API + backend/.env JWT_SECRET 签发临时 token；只在本机回环调用）
//   node data-import/import-mdd-sales-sep.cjs [xlsx路径] [--dry-run]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const XLSX_FILE = process.argv.find((a, i) => i > 0 && a.endsWith('.xlsx'))
  || path.join(ROOT, 'morgandada', '9月dada小红书销售明细汇总.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');

const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const XLSX = frontendRequire('xlsx');
const jwt = require(path.join(ROOT, 'backend', 'node_modules', 'jsonwebtoken'));

// 加载 backend/.env（JWT_SECRET）
let secret = '';
for (const line of fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*JWT_SECRET\s*=\s*"?(.*?)"?\s*$/);
  if (m) secret = m[1];
}

const dayjsFmt = (v, lastGood) => {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const num = Number(v);
  if (Number.isFinite(num) && String(v).trim() !== '' && num > 20000 && num < 80000) {
    // Excel 日期序列号（1900 体系，2026 年约 46000+）
    return new Date(Date.UTC(1899, 11, 30) + num * 86400000).toISOString().slice(0, 10);
  }
  if (Number.isFinite(num) && num >= 1 && num <= 32 && lastGood) {
    // 纯数字：整数=日号（1 = 上个订单同月 1 号）；小数=月.日 写法（9.6 = 9月6日，按字面拆分避免浮点误差）
    if (!Number.isInteger(num)) {
      const parts = String(v).trim().split('.');
      if (parts.length === 2) {
        const mm = Number(parts[0]);
        const dd = Number(parts[1]);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          return `${lastGood.slice(0, 4)}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        }
      }
    }
    return `${lastGood.slice(0, 7)}-${String(num).padStart(2, '0')}`;
  }
  let s = String(v).trim().replace(/\s+/g, '');
  if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[.\-/]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "9月22日" / "9-22"：年月沿用上一个订单
  const md = s.replace(/[年月]/g, '-').replace(/日/, '').replace(/\./g, '-').match(/^(\d{1,2})-(\d{1,2})$/);
  if (md && lastGood) {
    return `${lastGood.slice(0, 7)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  return null;
};

(async () => {
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const rows = [];
  let head = null;
  let lastGood = null;
  let badDates = 0;
  for (const r of raw) {
    if (r['日期'] != null && r['日期'] !== '') {
      const d = dayjsFmt(r['日期'], lastGood);
      if (d) {
        lastGood = d;
        head = {
          date: d,
          orderSeq: r['订单序号'] != null ? String(r['订单序号']) : null,
          internalNo: r['内部单号'] != null && r['内部单号'] !== '' ? String(r['内部单号']) : null,
          customerName: r['客户姓名'] ? String(r['客户姓名']).trim() : null,
          phone: r['手机号码'] != null && r['手机号码'] !== '' ? String(r['手机号码']).trim() : null,
          repurchase: r['是否回购'] ? String(r['是否回购']).trim() : null,
          channel: r['渠道'] ? String(r['渠道']).trim() : null,
          amount: r['收款合计'] ?? null,
          staff: r['销售顾问'] ? String(r['销售顾问']).trim() : null,
          remark: r['备注'] ? String(r['备注']).trim() : null,
        };
      } else {
        badDates += 1;
        // 日期无法解析：沿用上一个订单的表头（前向透传），不产生空日期行
      }
    }
    if (!head || !head.date) continue;
    if ((r['产品型号'] ?? '') === '' && (r['品名'] ?? '') === '') continue;
    rows.push({
      ...head,
      productModel: r['产品型号'] ? String(r['产品型号']).trim() : null,
      productName: r['品名'] ? String(r['品名']).trim() : null,
      color: r['颜色'] ? String(r['颜色']).trim() : null,
      size: r['尺码'] != null && r['尺码'] !== '' ? String(r['尺码']).trim() : null,
      quantity: Number(r['数量'] ?? 0) || 0,
      unitPrice: r['单价'] ?? null,
      discountSub: r['折后小计'] ?? null,
    });
  }
  console.log(`解析订单行 ${rows.length}（首行 ${rows[0]?.date}，末行 ${rows[rows.length - 1]?.date}；无法解析日期 ${badDates} 处已透传）${DRY_RUN ? '（dry-run：仅解析不导入）' : ''}`);
  if (process.argv.includes('--debug-rows')) {
    for (const i of [275, 276, 277, 278, 279, 280]) {
      const r = rows[i];
      console.log(`sent#${i + 1}`, JSON.stringify(r ? { date: r.date, staff: r.staff, pm: r.productName } : null));
    }
  }
  if (!rows.length || DRY_RUN) {
    process.exit(rows.length ? 0 : 1);
  }
  const token = jwt.sign({ sub: 1, phone: '', role: 'ADMIN' }, secret, { expiresIn: '30m' });
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/mdd/sales/import-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ rows }),
  });
  const j = await res.json().catch(() => null);
  if (!j) { console.error(`HTTP ${res.status} 非 JSON 响应`); process.exit(1); }
  console.log(JSON.stringify(j, null, 1));
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
