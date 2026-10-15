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

const dayjsFmt = (v) => {
  if (v instanceof Date) {
    // xlsx cellDates 读出的 UTC 时间即 Excel 里的字面时间（无时区修正需求，按日期取字面）
    const s = v.toISOString().slice(0, 10);
    return s;
  }
  const num = Number(v);
  if (Number.isFinite(num) && num > 200000 && num < 500000) {
    return new Date(Date.UTC(1899, 11, 30) + num * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

(async () => {
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const rows = [];
  let head = null;
  for (const r of raw) {
    if (r['日期'] != null && r['日期'] !== '') {
      head = {
        date: dayjsFmt(r['日期']),
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
    }
    if (!head) continue;
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
  console.log(`解析订单行 ${rows.length}（首行日期 ${rows[0]?.date}，末行 ${rows[rows.length - 1]?.date}）${DRY_RUN ? '（dry-run：仅解析不导入）' : ''}`);
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
