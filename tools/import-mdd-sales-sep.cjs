// 一次性导入: 9月dada小红书销售明细汇总.xlsx → 生产 /mdd/sales/import-orders (跑完即删)
// 逻辑复刻前端 parseOrderRows: 表头字段向下透传 + Excel 日期序列号容错
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const SAAS = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(SAAS, 'frontend', 'package.json'));
const backendRequire = createRequire(path.join(SAAS, 'backend', 'package.json'));
const XLSX = frontendRequire('xlsx');
const jwt = backendRequire('jsonwebtoken');
const { PrismaClient } = backendRequire('@prisma/client');

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
// JWT_SECRET 优先本地 .env（与生产一致才可签有效 token；否则回退服务器值——只读对账用）
const env = loadEnv(path.join(SAAS, 'backend', '.env'));
const JWT_SECRET = env.JWT_SECRET;

const dayjsFmt = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
function normalizeDay(v, lastGood) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return dayjsFmt(v);
  const num = Number(v);
  if (Number.isFinite(num) && String(v).trim() !== '' && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (Number.isFinite(num) && num >= 1 && num <= 32 && lastGood) {
    // 纯数字：整数=日号；小数=月.日 写法（9.6 = 9月6日）
    if (!Number.isInteger(num)) {
      const parts = String(v).trim().split('.');
      const mm = Number(parts[0]);
      const dd = Number(parts[1] || '0');
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${lastGood.slice(0, 4)}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }
    return `${lastGood.slice(0, 7)}-${String(num).padStart(2, '0')}`;
  }
  let s = String(v).trim().replace(/\s+/g, '');
  if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[.\-/]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}[.月]\d{1,2}日?$/.test(s) && lastGood) {
    const md = s.replace(/[月.]/g, '-').replace(/日/, '').match(/^(\d{1,2})-(\d{1,2})$/);
    if (md) return `${lastGood.slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? '' : dayjsFmt(d2);
}

(async () => {
  const DRY = !process.argv.includes('--doit');
  const xlsxArg = process.argv.find((a) => a.startsWith('--xlsx='));
  const xlsxPath = xlsxArg ? xlsxArg.slice(7) : path.join(SAAS, 'morgandada', '9月dada小红书销售明细汇总.xlsx');
  const wb = XLSX.readFile(xlsxPath);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const rows = [];
  let head = null;
  let lastGood = null;
  for (const r of raw) {
    if (r['日期'] != null && r['日期'] !== '') {
      const d = normalizeDay(r['日期'], lastGood);
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
      }
    }
    if (!head || !head.date) continue;
    const hasProduct = (r['产品型号'] ?? '') !== '' || (r['品名'] ?? '') !== '';
    if (!hasProduct) continue;
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
  const qty = rows.reduce((a, x) => a + x.quantity, 0);
  const dates = [...new Set(rows.map((x) => x.date))].sort();
  console.log(`parsed rows=${rows.length} qty=${qty} dates=${dates[0]}~${dates[dates.length - 1]} staff=[${[...new Set(rows.map((x) => x.staff).filter(Boolean))].join(',')}]`);
  if (DRY) { console.log('DRY-RUN only'); process.exit(0); }

  // 签 token: JWT_SECRET 取服务器 .env（脚本在服务器跑）
  const srvEnv = loadEnv('/opt/saas/backend/.env');
  const secret = (JWT_SECRET && JWT_SECRET === srvEnv.JWT_SECRET ? srvEnv.JWT_SECRET : srvEnv.JWT_SECRET) || JWT_SECRET;
  const prisma = new PrismaClient();
  const u = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  await prisma.$disconnect();
  const token = jwt.sign({ sub: u.id, phone: u.phone, role: u.role, brandId: 5 }, secret, { expiresIn: '30m' });
  const res = await fetch('http://127.0.0.1:3000/api/agency-api/mdd/sales/import-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ rows }),
  });
  const j = await res.json();
  console.log('import result:', JSON.stringify(j.data ?? j).slice(0, 400));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
