/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 生产环境种子：仅创建登录链路必需的基础设施
 * - 模块树（ModuleNode）
 * - 公司（Company）
 * - 管理员账号（从环境变量读取，避免硬编码）
 * - 默认品牌 + 管理员品牌成员关系
 * 不包含任何演示业务数据。
 *
 * 用法：
 *   PROD_ADMIN_PHONE=13800000001 PROD_ADMIN_PASSWORD='强密码' npm run seed:prod
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

const sha1 = (text) =>
  crypto.createHash('sha1').update(text, 'utf8').digest('hex');

const ADMIN_PHONE = process.env.PROD_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD;
const COMPANY_NAME = process.env.PROD_COMPANY_NAME || 'Marketine';
const SYSTEM_NAME = process.env.PROD_SYSTEM_NAME || '智能商业营销系统';

if (!ADMIN_PHONE || !ADMIN_PASSWORD) {
  console.error(
    '[seed:prod] 缺少环境变量：需要 PROD_ADMIN_PHONE 和 PROD_ADMIN_PASSWORD',
  );
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('[seed:prod] 管理员密码长度至少 8 位');
  process.exit(1);
}

const MODULE_TREE = [
  {
    key: 'm_project',
    name: '项目管理',
    icon: 'ProjectOutlined',
    children: [
      {
        name: '项目管理',
        features: [
          { name: '项目列表', path: '/project/manage/list' },
        ],
      },
    ],
  },
  {
    key: 'm_kol',
    name: 'KOL管理',
    icon: 'TeamOutlined',
    children: [
      {
        name: '达人资源',
        features: [
          { name: '达人广场', path: '/kol/kol-source/list' },
          { name: '机构管理', path: '/kol/kol-source/mcn' },
        ],
      },
      {
        name: '达人管理',
        features: [{ name: '达人库', path: '/kol/kol-manage/list' }],
      },
      {
        name: '审核',
        features: [{ name: '变更审核', path: '/kol/review/list' }],
      },
      {
        name: '日志',
        features: [{ name: '操作日志', path: '/kol/log' }],
      },
    ],
  },
  {
    key: 'm_content_pro',
    name: '内容中心Pro',
    icon: 'AppstoreOutlined',
    children: [
      {
        name: '工作台',
        features: [
          { name: '总览', path: '/content-center-pro/workbench/overview' },
        ],
      },
      {
        name: '内容包',
        features: [
          { name: '内容包列表', path: '/content-center-pro/campaign/content-package' },
        ],
      },
      {
        name: '批量创作',
        features: [
          { name: '批量任务', path: '/content-center-pro/campaign/batch-tasks' },
        ],
      },
      {
        name: '配置中心',
        features: [
          { name: '产品配置', path: '/content-center-pro/config/products' },
        ],
      },
    ],
  },
  {
    key: 'm_kox',
    name: 'KOX运营管理',
    icon: 'CarOutlined',
    children: [
      {
        name: '运营分析',
        features: [
          { name: '运营总览', path: '/kox_df/operation-analysis/overview' },
          { name: '车型销量', path: '/kox_df/operation-analysis/model-sales' },
        ],
      },
      {
        name: '监测管理',
        features: [{ name: '监测列表', path: '/kox_df/monitoring/list' }],
      },
      {
        name: '任务管理',
        features: [
          { name: '任务列表', path: '/kox_df/content-task/task-list' },
        ],
      },
    ],
  },
  {
    key: 'm_insight',
    name: '品牌洞察',
    icon: 'GlobalOutlined',
    children: [
      {
        name: '监测管理',
        features: [
          { name: '品牌监测', path: '/brandcosinsight/monitor/brand' },
          { name: '报告中心', path: '/brandcosinsight/report/center' },
        ],
      },
    ],
  },
  {
    key: 'm_crm',
    name: '客户CRM',
    icon: 'UserOutlined',
    children: [
      {
        name: '工作台',
        features: [{ name: '数据总览', path: '/dashboard' }],
      },
      {
        name: '客户管理',
        features: [{ name: '客户列表', path: '/customers' }],
      },
      {
        name: '订单管理',
        features: [{ name: '订单列表', path: '/orders' }],
      },
      {
        name: '系统管理',
        features: [{ name: '用户管理', path: '/users/manage' }],
      },
    ],
  },
];

const ADMIN_ACTIONS = [
  'kol:classify',
  'kol:create',
  'kol:delete',
  'kol:direct_edit',
  'kol:edit',
  'kol:export',
  'kol:import',
  'kol:review',
  'kol:toggle_status',
  'kol:transfer',
  'log:export',
  'crm:customer_edit',
  'crm:order_edit',
];

async function seedModuleTree() {
  let catSort = 0;
  for (const category of MODULE_TREE) {
    const cat = await prisma.moduleNode.upsert({
      where: { key: category.key },
      update: {
        name: category.name,
        icon: category.icon,
        type: 'category',
        sort: catSort,
      },
      create: {
        key: category.key,
        name: category.name,
        icon: category.icon,
        type: 'category',
        sort: catSort,
      },
    });
    catSort += 1;

    let groupSort = 0;
    for (const group of category.children) {
      const groupKey = `${category.key}_g${groupSort}`;
      const grp = await prisma.moduleNode.upsert({
        where: { key: groupKey },
        update: { name: group.name, type: 'group', parentId: cat.id, sort: groupSort },
        create: {
          key: groupKey,
          name: group.name,
          type: 'group',
          parentId: cat.id,
          sort: groupSort,
        },
      });
      groupSort += 1;

      let featureSort = 0;
      for (const feature of group.features) {
        const featureKey = `${groupKey}_f${featureSort}`;
        await prisma.moduleNode.upsert({
          where: { key: featureKey },
          update: { name: feature.name, path: feature.path, type: 'feature', parentId: grp.id, sort: featureSort },
          create: {
            key: featureKey,
            name: feature.name,
            type: 'feature',
            path: feature.path,
            parentId: grp.id,
            sort: featureSort,
          },
        });
        featureSort += 1;
      }
    }
  }
  const total = await prisma.moduleNode.count();
  console.log(`[seed:prod] 模块树已同步（共 ${total} 节点，按 key upsert 保留既有 ID）`);
}

async function main() {
  await seedModuleTree();

  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: { name: COMPANY_NAME, systemName: SYSTEM_NAME },
    create: {
      id: 1,
      name: COMPANY_NAME,
      adminFlag: 1,
      sourceConfig: 'marketine',
      systemName: SYSTEM_NAME,
      systemDesc: SYSTEM_NAME,
      companyType: 1,
      userCompanyStatus: 1,
    },
  });
  console.log('[seed:prod] 公司就绪:', company.name);

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: {
      actions: ADMIN_ACTIONS,
      role: 'ADMIN',
      adminFlag: 1,
      passwordHash: bcrypt.hashSync(sha1(ADMIN_PASSWORD), 10),
    },
    create: {
      phone: ADMIN_PHONE,
      passwordHash: bcrypt.hashSync(sha1(ADMIN_PASSWORD), 10),
      name: '管理员',
      nickname: 'admin',
      role: 'ADMIN',
      adminFlag: 1,
      companyId: company.id,
      actions: ADMIN_ACTIONS,
    },
  });
  console.log('[seed:prod] 管理员就绪:', admin.phone);

  const brand = await prisma.brand.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyId: company.id,
      name: COMPANY_NAME,
      description: '默认品牌工作区',
      status: 1,
    },
  });

  await prisma.brandMember.upsert({
    where: {
      brandId_userId_roleKey: {
        brandId: brand.id,
        userId: admin.id,
        roleKey: 'agency_manager',
      },
    },
    update: {},
    create: {
      brandId: brand.id,
      userId: admin.id,
      roleKey: 'agency_manager',
    },
  });
  console.log('[seed:prod] 默认品牌与成员关系就绪');
  console.log('[seed:prod] 完成，无演示数据');
}

main()
  .catch((e) => {
    console.error('[seed:prod] 失败:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
