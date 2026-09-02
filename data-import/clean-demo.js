#!/usr/bin/env node
/**
 * 清理演示数据，仅保留格力数据与系统基础设施（用户/公司/品牌/菜单）。
 *
 * 用法：
 *   node clean-demo.js           预览（dry-run，不写库）
 *   node clean-demo.js --apply   执行删除
 */
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const APPLY = process.argv.includes('--apply');
const KEEP_PRODUCT_KEYWORD = '格力';

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const prisma = new PrismaClient();

const notGree = { name: { not: { contains: KEEP_PRODUCT_KEYWORD } } };

const STEPS = [
  { label: 'KolLog（演示操作日志）', model: 'kolLog', where: {} },
  { label: 'KolReview（演示审核）', model: 'kolReview', where: {} },
  { label: 'KolCreator（演示达人库）', model: 'kolCreator', where: {} },
  { label: 'Order（演示订单）', model: 'order', where: {} },
  { label: 'Customer（演示客户）', model: 'customer', where: {} },
  { label: 'PackageMaterial（演示素材）', model: 'packageMaterial', where: {} },
  { label: 'BatchTask（演示批量任务）', model: 'batchTask', where: {} },
  { label: 'ContentPackage（演示内容包）', model: 'contentPackage', where: {} },
  { label: 'Project（演示项目）', model: 'project', where: {} },
  { label: 'ProjectFolder（演示项目文件夹）', model: 'projectFolder', where: {} },
  { label: 'KoxTaskAuthor（任务作者关联）', model: 'koxTaskAuthor', where: {} },
  { label: 'KoxTask（演示任务）', model: 'koxTask', where: {} },
  { label: 'KoxDailyStat（演示日报）', model: 'koxDailyStat', where: {} },
  { label: 'KoxDealerSales（演示销量）', model: 'koxDealerSales', where: {} },
  {
    label: 'KosAccount（kos_seed_* 演示账号）',
    model: 'kosAccount',
    where: { authorId: { startsWith: 'kos_seed_' } },
  },
  {
    label: 'Product（非格力子节点）',
    model: 'product',
    where: { AND: [{ parentId: { not: null } }, notGree] },
  },
  {
    label: 'Product（非格力根节点）',
    model: 'product',
    where: { AND: [{ parentId: null }, notGree] },
  },
];

async function main() {
  console.log(APPLY ? '=== 执行删除 ===' : '=== 预览（dry-run，加 --apply 才真正删除）===');
  for (const step of STEPS) {
    const model = prisma[step.model];
    if (APPLY) {
      const r = await model.deleteMany({ where: step.where });
      console.log(`[已删] ${step.label}: ${r.count}`);
    } else {
      const c = await model.count({ where: step.where });
      console.log(`[将删] ${step.label}: ${c}`);
    }
  }

  const [kosTotal, kosGree, prodTotal, prodGree] = await Promise.all([
    prisma.kosAccount.count(),
    prisma.kosAccount.count({
      where: { authorId: { not: { startsWith: 'kos_seed_' } } },
    }),
    prisma.product.count(),
    prisma.product.count({ where: { name: { contains: KEEP_PRODUCT_KEYWORD } } }),
  ]);
  console.log('\n=== 清理后剩余 ===');
  console.log(`KosAccount 总数=${kosTotal}（格力 ${kosGree}）`);
  console.log(`Product 总数=${prodTotal}（格力 ${prodGree}）`);
  if (!APPLY) console.log('\n以上为预览，确认无误后执行: node clean-demo.js --apply');
}

main()
  .catch((e) => {
    console.error('清理失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
