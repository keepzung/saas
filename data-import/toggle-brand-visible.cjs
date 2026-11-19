#!/usr/bin/env node
// 服务器运行：切换工作区在切换列表中的可见性（Brand.status 1=显示 0=隐藏）
// 用法: node toggle-brand-visible.cjs --brand=9 --hide   # 隐藏（切换抽屉/登录选择不再出现）
//       node toggle-brand-visible.cjs --brand=9 --show   # 恢复显示
// 说明: 仅改 Brand.status；API(visibleBrands/brand/myList) 均按 status=1 过滤，立即生效无需重启。
//       直连 URL 访问仍可达（仅 UI 隐藏），后端数据不受影响。
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const p = new PrismaClient();
(async () => {
  const brandArg = (process.argv.find((a) => a.startsWith('--brand=')) || '').split('=')[1];
  const brandId = Number(brandArg);
  if (!Number.isInteger(brandId) || brandId <= 0) {
    console.error('用法: node toggle-brand-visible.cjs --brand=<brandId> --hide|--show');
    process.exit(1);
  }
  const hide = process.argv.includes('--hide');
  const show = process.argv.includes('--show');
  if (hide === show) {
    console.error('请指定 --hide 或 --show 之一');
    process.exit(1);
  }
  const brand = await p.brand.findUnique({ where: { id: brandId } });
  if (!brand) { console.error(`brand ${brandId} 不存在`); process.exit(1); }
  await p.brand.update({ where: { id: brandId }, data: { status: hide ? 0 : 1 } });
  console.log(`brand ${brandId} ${brand.name}: status ${brand.status} → ${hide ? 0 : 1}（${hide ? '已隐藏' : '已恢复显示'}）`);
  await p.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
