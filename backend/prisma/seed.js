/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

const sha1 = (text) =>
  crypto.createHash('sha1').update(text, 'utf8').digest('hex');

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
  await prisma.moduleNode.deleteMany();
  let sort = 0;
  for (const category of MODULE_TREE) {
    const cat = await prisma.moduleNode.create({
      data: {
        key: category.key,
        name: category.name,
        icon: category.icon,
        type: 'category',
        sort: sort++,
      },
    });
    let groupSort = 0;
    for (const group of category.children) {
      const grp = await prisma.moduleNode.create({
        data: {
          key: `${category.key}_g${groupSort}`,
          name: group.name,
          type: 'group',
          parentId: cat.id,
          sort: groupSort++,
        },
      });
      let featureSort = 0;
      for (const feature of group.features) {
        await prisma.moduleNode.create({
          data: {
            key: `${grp.key}_f${featureSort}`,
            name: feature.name,
            type: 'feature',
            path: feature.path,
            parentId: grp.id,
            sort: featureSort++,
          },
        });
      }
    }
  }
}

async function main() {
  await seedModuleTree();

  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Marketine',
      adminFlag: 1,
      sourceConfig: 'marketine',
      systemName: '智能商业营销系统',
      systemDesc: '智能商业营销系统',
      companyType: 1,
      userCompanyStatus: 1,
    },
  });
  console.log('Seeded company:', company.name);

  const admin = await prisma.user.upsert({
    where: { phone: '18519236161' },
    update: { actions: ADMIN_ACTIONS },
    create: {
      phone: '18519236161',
      passwordHash: bcrypt.hashSync(sha1('Agent@666'), 10),
      name: '管理员',
      nickname: 'mark',
      role: 'ADMIN',
      adminFlag: 1,
      companyId: company.id,
      actions: ADMIN_ACTIONS,
    },
  });
  console.log('Seeded admin:', admin.phone);

  const sales = await prisma.user.upsert({
    where: { phone: '13800000000' },
    update: {},
    create: {
      phone: '13800000000',
      passwordHash: bcrypt.hashSync(sha1('123456'), 10),
      name: '演示销售',
      nickname: '销售小王',
      role: 'SALES',
      adminFlag: 0,
      companyId: company.id,
      actions: ['crm:customer_edit'],
    },
  });
  console.log('Seeded sales:', sales.phone);

  const brand = await prisma.brand.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyId: company.id,
      name: 'Marketine',
      description: '演示品牌工作区',
      status: 1,
    },
  });
  console.log('Seeded brand:', brand.name);

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
  await prisma.brandMember.upsert({
    where: {
      brandId_userId_roleKey: {
        brandId: brand.id,
        userId: sales.id,
        roleKey: 'agency_executive',
      },
    },
    update: {},
    create: {
      brandId: brand.id,
      userId: sales.id,
      roleKey: 'agency_executive',
    },
  });
  console.log('Seeded brand members');

  const existingCustomers = await prisma.customer.count();
  if (existingCustomers === 0) {
    await prisma.customer.createMany({
      data: [
        {
          name: '张伟',
          phone: '13911112222',
          company: '东风汽车',
          level: 'VIP',
          followStatus: 'FOLLOWING',
          createdById: admin.id,
        },
        {
          name: '李娜',
          phone: '13933334444',
          company: '华帝股份',
          level: 'NORMAL',
          followStatus: 'CONVERTED',
          createdById: admin.id,
        },
        {
          name: '王强',
          phone: '13955556666',
          company: '大众中国',
          level: 'VIP',
          followStatus: 'UNCONTACTED',
          createdById: sales.id,
        },
      ],
    });

    const customers = await prisma.customer.findMany();
    const day = 24 * 60 * 60 * 1000;
    await prisma.order.createMany({
      data: [
        {
          orderNo: 'SO20260801001',
          customerId: customers[0].id,
          createdById: admin.id,
          amount: 12800.0,
          payStatus: 'PAID',
          orderedAt: new Date(Date.now() - 21 * day),
        },
        {
          orderNo: 'SO20260810002',
          customerId: customers[1].id,
          createdById: admin.id,
          amount: 5600.5,
          payStatus: 'PENDING',
          orderedAt: new Date(Date.now() - 12 * day),
        },
        {
          orderNo: 'SO20260822003',
          customerId: customers[0].id,
          createdById: sales.id,
          amount: 9900.0,
          payStatus: 'REFUNDED',
          orderedAt: new Date(),
        },
      ],
    });
    console.log('Seeded demo customers & orders');
  }

  const existingProjects = await prisma.project.count();
  if (existingProjects === 0) {
    const folderQ3 = await prisma.projectFolder.create({
      data: { name: '2026 Q3 种草campaign', brandId: brand.id, sort: 0 },
    });
    const folderMonitor = await prisma.projectFolder.create({
      data: { name: '品牌监测项目', brandId: brand.id, sort: 1 },
    });

    const day = 24 * 60 * 60 * 1000;
    const year = new Date().getFullYear();

    const projectsData = [
      {
        projectCode: `PRJ-${year}-0001`,
        name: '华帝新品上市种草项目',
        clientName: '华帝股份',
        folderId: folderQ3.id,
        status: 'active',
        phase: 'executing',
        startDate: new Date(Date.now() - 30 * day),
        endDate: new Date(Date.now() + 60 * day),
        budgetTotal: 150000,
        ownerId: admin.id,
        createdById: admin.id,
        stats: {
          create: {
            deliverableCount: 6,
            plannedQuantity: 40,
            completedQuantity: 18,
            plannedCost: 120000,
            actualCost: 56000,
            acceptedCount: 12,
            riskCount: 1,
            relationCount: 25,
            quoteDraftAmount: 128000,
            quoteCollaborationStatus: 'collaborating',
            costCompletedCount: 5,
            costExpectedCount: 8,
            sheetCount: 2,
            talentTotal: 25,
            formalCount: 15,
            backupCount: 10,
            approvedCount: 12,
            pendingCount: 6,
            rejectedCount: 2,
            unavailableCount: 1,
            executionTotal: 25,
            readyToStart: 3,
            draftCount: 4,
            revisionRequired: 2,
            internalReview: 3,
            brandReview: 3,
            readyToPublish: 1,
            publishedCount: 9,
            overdueCount: 1,
            attentionLabel: '3条内容待品牌审核',
            attentionCreator: '李娜',
            attentionLevel: 'high',
          },
        },
      },
      {
        projectCode: `PRJ-${year}-0002`,
        name: '东风纳米区域试驾传播',
        clientName: '东风汽车',
        folderId: folderQ3.id,
        status: 'active',
        phase: 'planning',
        startDate: new Date(Date.now() - 10 * day),
        endDate: new Date(Date.now() + 45 * day),
        budgetTotal: 88000,
        ownerId: sales.id,
        createdById: admin.id,
        stats: {
          create: {
            deliverableCount: 3,
            plannedQuantity: 20,
            completedQuantity: 4,
            plannedCost: 70000,
            actualCost: 9000,
            acceptedCount: 2,
            riskCount: 0,
            relationCount: 8,
            quoteDraftAmount: 66000,
            quoteCollaborationStatus: 'not_configured',
            costCompletedCount: 1,
            costExpectedCount: 5,
            sheetCount: 1,
            talentTotal: 8,
            formalCount: 4,
            backupCount: 4,
            approvedCount: 3,
            pendingCount: 3,
            rejectedCount: 0,
            unavailableCount: 0,
            executionTotal: 8,
            readyToStart: 2,
            draftCount: 1,
            revisionRequired: 0,
            internalReview: 1,
            brandReview: 0,
            readyToPublish: 0,
            publishedCount: 2,
            overdueCount: 0,
            attentionLabel: '报价单待补充成本项',
            attentionCreator: '王强',
            attentionLevel: 'low',
          },
        },
      },
      {
        projectCode: `PRJ-${year}-0003`,
        name: '大众ID.系列年度框架',
        clientName: '大众中国',
        folderId: folderQ3.id,
        status: 'draft',
        phase: 'planning',
        startDate: null,
        endDate: null,
        budgetTotal: 0,
        ownerId: admin.id,
        createdById: admin.id,
        stats: { create: {} },
      },
      {
        projectCode: `PRJ-${year}-0004`,
        name: '保时捷南区口碑监测',
        clientName: '保时捷',
        folderId: folderMonitor.id,
        status: 'active',
        phase: 'accepting',
        startDate: new Date(Date.now() - 90 * day),
        endDate: new Date(Date.now() - 5 * day),
        budgetTotal: 60000,
        ownerId: sales.id,
        createdById: admin.id,
        stats: {
          create: {
            deliverableCount: 4,
            plannedQuantity: 12,
            completedQuantity: 12,
            plannedCost: 55000,
            actualCost: 58200,
            acceptedCount: 10,
            riskCount: 0,
            relationCount: 12,
            quoteDraftAmount: 60000,
            quoteCollaborationStatus: 'completed',
            costCompletedCount: 6,
            costExpectedCount: 6,
            sheetCount: 1,
            talentTotal: 12,
            formalCount: 12,
            backupCount: 0,
            approvedCount: 12,
            pendingCount: 0,
            rejectedCount: 0,
            unavailableCount: 0,
            executionTotal: 12,
            readyToStart: 0,
            draftCount: 0,
            revisionRequired: 0,
            internalReview: 0,
            brandReview: 1,
            readyToPublish: 1,
            publishedCount: 11,
            overdueCount: 0,
            attentionLabel: '品牌验收报告待提交',
            attentionCreator: 'mark',
            attentionLevel: 'low',
          },
        },
      },
      {
        projectCode: `PRJ-${year}-0005`,
        name: '2025 双十一达人带货',
        clientName: '华帝股份',
        folderId: null,
        status: 'archived',
        phase: 'closed',
        startDate: new Date(Date.now() - 300 * day),
        endDate: new Date(Date.now() - 240 * day),
        budgetTotal: 200000,
        ownerId: admin.id,
        createdById: admin.id,
        archivedAt: new Date(Date.now() - 235 * day),
        stats: {
          create: {
            deliverableCount: 8,
            plannedQuantity: 60,
            completedQuantity: 58,
            plannedCost: 180000,
            actualCost: 175400,
            acceptedCount: 55,
            riskCount: 0,
            relationCount: 60,
            quoteDraftAmount: 195000,
            quoteCollaborationStatus: 'completed',
            costCompletedCount: 9,
            costExpectedCount: 9,
            sheetCount: 3,
            talentTotal: 60,
            formalCount: 45,
            backupCount: 15,
            approvedCount: 58,
            pendingCount: 0,
            rejectedCount: 1,
            unavailableCount: 1,
            executionTotal: 60,
            readyToStart: 0,
            draftCount: 0,
            revisionRequired: 0,
            internalReview: 0,
            brandReview: 0,
            readyToPublish: 0,
            publishedCount: 58,
            overdueCount: 0,
            attentionLabel: '暂无待办',
            attentionLevel: 'none',
          },
        },
      },
    ];

    for (const data of projectsData) {
      await prisma.project.create({ data });
    }
    console.log(`Seeded ${projectsData.length} projects + 2 folders`);
  }

  const existingKol = await prisma.kolCreator.count();
  if (existingKol === 0) {
    const day = 24 * 60 * 60 * 1000;
    const MCNS = ['遥望科技', '无忧传媒', '青藤文化', '仙梓文化'];

    const creatorsData = [
      { nickname: '阿岚的家居日记', fans: 523000, mcn: MCNS[0], category: '家居', location: '上海 徐汇区', gender: '女', pp: 38000, vp: 68000, inLib: true, contact: 'contacting', phone: '13811110001', wx: 'alan_home2026', owner: admin.id, tags: ['家居好物', '软装'], brands: ['林氏木业', '源氏木语'], em: 120000, rm: 45000, im: 6800, er: 1.3, notes: 286 },
      { nickname: '车评老张', fans: 1280000, mcn: MCNS[1], category: '汽车', location: '北京 朝阳区', gender: '男', pp: 95000, vp: 168000, inLib: true, contact: 'contacted', phone: '13811110002', wx: 'laozhang_auto', owner: admin.id, tags: ['汽车测评', '新车导购'], brands: ['比亚迪', '蔚来'], em: 580000, rm: 210000, im: 32000, er: 2.6, notes: 512 },
      { nickname: '佳琦的美妆小铺', fans: 896000, mcn: MCNS[2], category: '美妆', location: '广东 广州', gender: '女', pp: 62000, vp: 110000, inLib: true, contact: 'contacted', phone: '13811110003', wx: 'jiaqi_beauty', owner: sales.id, tags: ['美妆教程', '护肤'], brands: ['珀莱雅', '薇诺娜'], em: 350000, rm: 128000, im: 18600, er: 2.1, notes: 403 },
      { nickname: '数码酱', fans: 268000, mcn: MCNS[3], category: '数码', location: '广东 深圳', gender: '男', pp: 21000, vp: 36000, inLib: true, contact: 'pending', owner: sales.id, tags: ['数码测评'], brands: [], em: 88000, rm: 31000, im: 4200, er: 1.6, notes: 198 },
      { nickname: '健身教练大刘', fans: 1520000, mcn: MCNS[1], category: '运动健身', location: '浙江 杭州', gender: '男', pp: 110000, vp: 195000, inLib: true, contact: 'failed', remark: '三次建联未回复，下季度再试', owner: admin.id, tags: ['健身', '减脂餐'], brands: ['Keep', '安踏'], em: 620000, rm: 240000, im: 41000, er: 2.8, notes: 620 },
      { nickname: '母婴小课堂', fans: 412000, mcn: MCNS[2], category: '母婴', location: '四川 成都', gender: '女', pp: 32000, vp: 58000, inLib: true, contact: 'contacting', wx: 'muying_kt', owner: sales.id, tags: ['育儿', '母婴好物'], brands: ['飞鹤'], em: 150000, rm: 56000, im: 8200, er: 2.0, notes: 312 },
      { nickname: '美食探店王', fans: 756000, mcn: null, category: '美食', location: '湖南 长沙', gender: '男', pp: 48000, vp: 82000, inLib: true, contact: 'pending', owner: null, tags: ['探店', '本地生活'], brands: [], em: 260000, rm: 96000, im: 14000, er: 1.9, notes: 445 },
      { nickname: '旅行摄影师小鹿', fans: 189000, mcn: MCNS[3], category: '旅行', location: '云南 昆明', gender: '女', pp: 15000, vp: 26000, inLib: false, contact: 'pending', owner: null, tags: ['旅拍'], brands: [], em: 62000, rm: 23000, im: 3100, er: 1.7, notes: 156 },
      { nickname: '穿搭指南针', fans: 934000, mcn: MCNS[0], category: '穿搭', location: '浙江 宁波', gender: '女', pp: 56000, vp: 98000, inLib: false, contact: 'pending', owner: null, tags: ['穿搭', 'ootd'], brands: [], em: 320000, rm: 118000, im: 17500, er: 1.9, notes: 388 },
      { nickname: '萌宠日常馆', fans: 677000, mcn: null, category: '宠物', location: '江苏 南京', gender: '女', pp: 42000, vp: 72000, inLib: false, contact: 'pending', owner: null, tags: ['宠物', '猫咪'], brands: [], em: 230000, rm: 85000, im: 12600, er: 1.9, notes: 356 },
      { nickname: '极简生活家', fans: 345000, mcn: MCNS[2], category: '生活方式', location: '上海 浦东新区', gender: '女', pp: 26000, vp: 44000, inLib: false, contact: 'pending', owner: null, tags: ['极简', '收纳'], brands: [], em: 110000, rm: 41000, im: 5900, er: 1.8, notes: 234 },
      { nickname: '科技前沿君', fans: 1100000, mcn: MCNS[1], category: '数码', location: '北京 海淀区', gender: '男', pp: 88000, vp: 152000, inLib: false, contact: 'pending', owner: null, tags: ['科技资讯', 'AI'], brands: [], em: 470000, rm: 175000, im: 26000, er: 2.4, notes: 530 },
      { nickname: '烘焙研究所', fans: 234000, mcn: null, category: '美食', location: '山东 青岛', gender: '女', pp: 18000, vp: 30000, inLib: false, contact: 'pending', owner: null, tags: ['烘焙', '甜品'], brands: [], em: 78000, rm: 29000, im: 4100, er: 1.8, notes: 187 },
      { nickname: '读书人老周', fans: 156000, mcn: MCNS[3], category: '知识', location: '湖北 武汉', gender: '男', pp: 12000, vp: 21000, inLib: false, contact: 'pending', owner: null, tags: ['读书', '书评'], brands: [], em: 52000, rm: 20000, im: 2800, er: 1.8, notes: 142 },
      { nickname: '露营笔记', fans: 488000, mcn: MCNS[0], category: '户外', location: '广东 深圳', gender: '男', pp: 36000, vp: 62000, inLib: false, contact: 'pending', owner: null, tags: ['露营', '户外装备'], brands: [], em: 170000, rm: 63000, im: 9200, er: 1.9, notes: 278 },
    ];

    for (let i = 0; i < creatorsData.length; i++) {
      const c = creatorsData[i];
      await prisma.kolCreator.create({
        data: {
          authorId: `xhs_author_${1000 + i}`,
          platform: 'xhs',
          platformId: 1,
          nickname: c.nickname,
          gender: c.gender,
          location: c.location,
          fans: c.fans,
          mcn: c.mcn,
          category: c.category,
          noteSign: '蒲公英接单中',
          noteCount: c.notes,
          exposureMedian: c.em,
          readMedian: c.rm,
          interactionMedian: c.im,
          engagementRate: c.er,
          picturePrice: c.pp,
          videoPrice: c.vp,
          pictureState: '可接单',
          videoState: '可接单',
          tags: c.tags,
          recentBrands: c.brands,
          inLibrary: c.inLib,
          contactStatus: c.inLib ? c.contact : 'pending',
          contactPhone: c.phone ?? null,
          contactWechat: c.wx ?? null,
          remark: c.remark ?? null,
          resourceStatus: i === 4 ? 0 : 1,
          ownerId: c.owner ?? null,
          createdById: admin.id,
        },
      });
    }

    const libCreators = await prisma.kolCreator.findMany({
      where: { inLibrary: true },
      orderBy: { id: 'asc' },
    });

    await prisma.kolReview.createMany({
      data: [
        {
          creatorId: libCreators[1].id,
          status: 'pending',
          summary: '修改联系电话、建联状态',
          changes: {
            contactPhone: { old: null, new: '13822220001' },
            contactStatus: { old: 'contacting', new: 'contacted' },
          },
          operatorId: sales.id,
        },
        {
          creatorId: libCreators[2].id,
          status: 'approved',
          summary: '修改标签、备注',
          changes: {
            tags: { old: ['美妆'], new: ['美妆教程', '护肤'] },
          },
          operatorId: sales.id,
          reviewedAt: new Date(Date.now() - 5 * day),
          reviewedById: admin.id,
        },
        {
          creatorId: libCreators[5].id,
          status: 'rejected',
          summary: '修改负责人',
          changes: { ownerId: { old: admin.id, new: sales.id } },
          operatorId: sales.id,
          reviewedAt: new Date(Date.now() - 2 * day),
          reviewedById: admin.id,
        },
      ],
    });

    await prisma.kolLog.createMany({
      data: [
        { actionType: 'collect', operatorId: admin.id, targetName: '达人库', targetCount: 7, summary: '批量收藏 7 位达人入库', operatedAt: new Date(Date.now() - 20 * day) },
        { actionType: 'edit', operatorId: sales.id, targetName: libCreators[1].nickname, summary: `提交「${libCreators[1].nickname}」的资料变更（联系电话、建联状态）`, operatedAt: new Date(Date.now() - 1 * day) },
        { actionType: 'review', operatorId: admin.id, targetName: libCreators[2].nickname, summary: `通过「${libCreators[2].nickname}」的变更`, operatedAt: new Date(Date.now() - 5 * day) },
        { actionType: 'toggle_status', operatorId: admin.id, targetName: libCreators[4].nickname, summary: `「${libCreators[4].nickname}」暂停合作`, operatedAt: new Date(Date.now() - 8 * day) },
        { actionType: 'delete', operatorId: admin.id, targetName: '过期水号', summary: '将「过期水号」移出达人库', operatedAt: new Date(Date.now() - 15 * day) },
        { actionType: 'import', operatorId: admin.id, targetName: '达人批量导入', targetCount: 15, summary: '导入 2026Q3 蒲公英榜单达人 15 位', operatedAt: new Date(Date.now() - 22 * day) },
        { actionType: 'export', operatorId: admin.id, targetName: '达人库导出', targetCount: 7, summary: '导出达人库全部记录', operatedAt: new Date(Date.now() - 3 * day) },
        { actionType: 'edit', operatorId: admin.id, targetName: libCreators[5].nickname, summary: `提交「${libCreators[5].nickname}」的资料变更（负责人）`, operatedAt: new Date(Date.now() - 2 * day) },
      ],
    });
    console.log(`Seeded ${creatorsData.length} kol creators + 3 reviews + 8 logs`);
  }

  const existingProducts = await prisma.product.count();
  const existingMaterials = await prisma.packageMaterial.count();
  if (existingProducts === 0) {
    const day = 24 * 60 * 60 * 1000;

    const vatti = await prisma.product.create({
      data: {
        name: '华帝烟灶套装',
        displayName: '华帝烟灶套装',
        configType: 'product',
        description: '华帝主力烟灶消套装，主打大吸力与自清洁',
        knowledge: '烟灶套装核心卖点：22m³大吸力、一键自清洁、烟灶联动。目标人群为新房装修家庭。',
        salesPolicy: '套装直降 800 元，赠安装与 5 年质保',
        faq: 'Q: 自清洁需要多久一次？A: 建议 15 天一次，30 秒完成。',
        sort: 1,
      },
    });
    const card1 = await prisma.product.create({
      data: {
        name: '新房装修种草',
        displayName: '新房装修种草',
        configType: 'strategy_card',
        parentId: vatti.id,
        description: '面向新房业主的种草策略：晒安装效果、对比旧厨房',
        sort: 1,
      },
    });
    await prisma.product.create({
      data: {
        name: '一键自清洁场景',
        displayName: '一键自清洁场景',
        configType: 'scene',
        parentId: card1.id,
        description: '演示油污清洁前后对比的短视频场景',
        sort: 1,
      },
    });
    await prisma.product.create({
      data: {
        name: '烟灶联动场景',
        displayName: '烟灶联动场景',
        configType: 'scene',
        parentId: card1.id,
        description: '开灶自动启动烟机的演示场景',
        sort: 2,
      },
    });
    const card2 = await prisma.product.create({
      data: {
        name: '旧厨改造焕新',
        displayName: '旧厨改造焕新',
        configType: 'strategy_card',
        parentId: vatti.id,
        description: '面向老房改造人群：强调免改管道、快速安装',
        sort: 2,
      },
    });
    await prisma.product.create({
      data: {
        name: '老厨房爆改前后',
        displayName: '老厨房爆改前后',
        configType: 'scene',
        parentId: card2.id,
        sort: 1,
      },
    });
    await prisma.product.create({
      data: {
        name: '华帝蒸烤一体机',
        displayName: '华帝蒸烤一体机',
        configType: 'product',
        description: '嵌入式蒸烤一体机，主打健康蒸烤',
        knowledge: '蒸烤一体机卖点：双直喷蒸汽、AI 温控曲线。人群为烘焙爱好者和宝妈。',
        sort: 2,
      },
    });
  }

  if (existingMaterials === 0) {
    const day = 24 * 60 * 60 * 1000;

    let pkg1 = await prisma.contentPackage.findFirst({
      where: { name: '华帝烟灶 · 618种草包' },
    });
    if (!pkg1) {
      const vatti = await prisma.product.findFirst({
        where: { name: '华帝烟灶套装' },
      });
      pkg1 = await prisma.contentPackage.create({
        data: {
          name: '华帝烟灶 · 618种草包',
          productId: vatti?.id ?? null,
          workflowType: 'pro',
          reviewMode: 2,
          createdById: admin.id,
        },
      });
    }
    let pkg2 = await prisma.contentPackage.findFirst({
      where: { name: '蒸烤一体机 · 日常内容池' },
    });
    if (!pkg2) {
      const vatti = await prisma.product.findFirst({
        where: { name: '华帝烟灶套装' },
      });
      pkg2 = await prisma.contentPackage.create({
        data: {
          name: '蒸烤一体机 · 日常内容池',
          productId: vatti?.id ?? null,
          workflowType: 'simple',
          reviewMode: 1,
          createdById: sales.id,
        },
      });
    }

    const mk = (pkgId, title, content, status, tags, ago) => ({
      packageId: pkgId,
      title,
      content,
      status,
      tags,
      conversationId: `seed_${title.length}_${ago}`,
      createdAt: new Date(Date.now() - ago * day),
    });

    await prisma.packageMaterial.createMany({
      data: [
        mk(pkg1.id, '华帝烟灶套装｜新房装修必看的厨房三件套', '新房装修选烟灶，一条视频讲清楚。\n\n22m³大吸力，爆炒也不跑烟；一键自清洁，再也不用拆洗。\n\n附上我家安装完的效果图，颜值党直接冲～\n\n#华帝 #新房装修 #烟灶套装', 'draft', ['华帝', '新房装修'], 1),
        mk(pkg1.id, '用了30天才敢说：这套烟灶真香', '真实使用30天报告。\n\n优点：吸力猛、噪音小、自清洁是真省事。\n缺点：触摸键需要适应两天。\n\n结论：预算8000以内闭眼入。\n\n#华帝 #真实测评', 'pending_review', ['华帝', '真实测评'], 2),
        mk(pkg1.id, '老厨房改造，烟灶换了之后幸福感爆棚', '老厨房焕新记。\n\n原来的烟机用了8年，油垢清不掉。换华帝套装后，免改管道直接装，师傅2小时搞定。\n\n#厨房改造 #华帝', 'approved', ['厨房改造'], 3),
        mk(pkg1.id, '烟灶联动是什么体验？开灶烟机自动启动', '科技感拉满的细节：烟灶联动。\n\n开灶瞬间烟机自动启动，关灶后延时3分钟自停。\n\n懒人福音，全程不用碰烟机。\n\n#华帝 #智能家居', 'pending_review', ['华帝', '智能家居'], 1),
        mk(pkg2.id, '华帝蒸烤一体机｜烘焙爱好者的第一台嵌入式', '从台式小烤箱升级嵌入式蒸烤一体机。\n\n双直喷蒸汽做欧包外脆内软，AI温控烤戚风不塌陷。\n\n附3个新手必烤配方～\n\n#蒸烤一体机 #烘焙', 'draft', ['烘焙', '蒸烤一体机'], 2),
        mk(pkg2.id, '周末在家蒸一桌菜，健康又省事', '蒸菜健康餐合集。\n\n一层蒸鱼一层蒸蛋一层时蔬，20分钟一桌出锅。\n\n#健康饮食 #蒸烤一体机', 'brand_approved', ['健康饮食'], 5),
        mk(pkg1.id, '自清洁功能实测：30秒搞定油污', '一键自清洁实测。\n\n加热溶解油污→高速甩干→流入油杯，全程30秒。\n\n对比之前手动拆洗，这是革命性升级。\n\n#华帝 #烟机清洁', 'rejected', ['华帝'], 4),
      ],
    });

    const rejectedItem = await prisma.packageMaterial.findFirst({
      where: { status: 'rejected' },
    });
    if (rejectedItem) {
      await prisma.packageMaterial.update({
        where: { id: rejectedItem.id },
        data: { reviewComment: '清洁演示画面缺失，请补充对比图' },
      });
    }

    await prisma.batchTask.createMany({
      data: [
        {
          taskName: '华帝烟灶·周末批量生成',
          status: 'completed',
          productId: pkg1.productId,
          targetQty: 5,
          successCount: 5,
          failedCount: 0,
          model: 'deepseek',
          packageId: pkg1.id,
          createdById: admin.id,
          createdAt: new Date(Date.now() - 6 * day),
        },
        {
          taskName: '蒸烤机·烘焙内容补充',
          status: 'partial_failed',
          productId: pkg2.productId,
          targetQty: 4,
          successCount: 3,
          failedCount: 1,
          model: 'qwen',
          packageId: pkg2.id,
          createdById: sales.id,
          createdAt: new Date(Date.now() - 2 * day),
        },
      ],
    });
    console.log('Seeded products tree + 2 packages + 7 materials + 2 batch tasks');
  }

  const existingKox = await prisma.kosAccount.count();
  if (existingKox === 0) {
    const day = 24 * 60 * 60 * 1000;

    const accounts = [
      ['华帝·广州天河旗舰店', 'KOS', 52000, '华南大区', '广州天河经销商', '金牌导购', '陈志强', '13811110001'],
      ['华帝·深圳南山专卖店', 'KOS', 34000, '华南大区', '深圳南山经销商', '金牌导购', '林晓彤', '13811110002'],
      ['华帝·佛山顺德卖场店', 'KOB', 21000, '华南大区', '佛山顺德经销商', '门店官号', '黄敏华', '13811110003'],
      ['华帝·上海徐汇体验店', 'KOS', 61000, '华东大区', '上海徐汇经销商', '金牌导购', '王佳琪', '13811110004'],
      ['华帝·杭州西湖门店', 'KOS', 28000, '华东大区', '杭州西湖经销商', '新锐主播', '周雨桐', '13811110005'],
      ['华帝·南京鼓楼卖场店', 'KOB', 19000, '华东大区', '南京鼓楼经销商', '门店官号', '吴倩文', '13811110006'],
      ['华帝·北京朝阳旗舰店', 'KOS', 73000, '华北大区', '北京朝阳经销商', '金牌导购', '赵天宇', '13811110007'],
      ['华帝·天津和平门店', 'KOS', 25000, '华北大区', '天津和平经销商', '直播达人', '孙梦瑶', '13811110008'],
      ['华帝·成都锦江体验店', 'KOS', 47000, '西南大区', '成都锦江经销商', '金牌导购', '何嘉玲', '13811110009'],
      ['华帝·重庆渝中门店', 'KOB', 16000, '西南大区', '重庆渝中经销商', '门店官号', '罗小珊', '13811110010'],
      ['家电测评君阿凯', 'KOC', 132000, '华南大区', null, '头部达人', null, null],
      ['厨房好物研究所', 'KOC', 89000, '华东大区', null, '腰部达人', null, null],
    ];
    const accountRows = await prisma.kosAccount.createMany({
      data: accounts.map(([nickname, type, fans, area, store, tag, op, mobile], i) => ({
        authorId: `kos_seed_${i + 1}`,
        nickname,
        platform: i % 3 === 2 ? 'xhs' : 'douyin',
        accountType: type,
        fans,
        areaName: area,
        storeName: store,
        accountTag: tag,
        operatorName: op,
        operatorMobile: mobile,
        authorUrl: `https://www.douyin.com/user/kos_seed_${i + 1}`,
        createdAt: new Date(Date.now() - (90 - i * 3) * day),
      })),
    });

    const allAccounts = await prisma.kosAccount.findMany({
      orderBy: { id: 'asc' },
    });

    const task1 = await prisma.koxTask.create({
      data: {
        taskTitle: '华帝烟灶·618直播种草任务',
        platform: 'douyin',
        taskAccountType: 'KOS',
        startTime: new Date(Date.now() - 45 * day),
        endTime: new Date(Date.now() - 15 * day),
        status: 'completed',
        createdById: admin.id,
        createdAt: new Date(Date.now() - 46 * day),
      },
    });
    const task2 = await prisma.koxTask.create({
      data: {
        taskTitle: '蒸烤一体机·秋季探店任务',
        platform: 'douyin',
        taskAccountType: 'KOS',
        startTime: new Date(Date.now() - 10 * day),
        endTime: new Date(Date.now() + 20 * day),
        status: 'ongoing',
        createdById: admin.id,
        createdAt: new Date(Date.now() - 11 * day),
      },
    });
    await prisma.koxTask.create({
      data: {
        taskTitle: '烟灶套装·双11预热短视频任务',
        platform: 'xhs',
        taskAccountType: 'KOC',
        startTime: new Date(Date.now() + 5 * day),
        endTime: new Date(Date.now() + 35 * day),
        status: 'ongoing',
        createdById: sales.id,
        createdAt: new Date(Date.now() - 1 * day),
      },
    });

    const rand = (min, max) => min + Math.floor(Math.random() * (max - min));
    const kosAccounts = allAccounts.filter((a) => a.accountType !== 'KOC');
    for (const [ti, taskId] of [task1.id, task2.id].entries()) {
      const done = ti === 0;
      for (const acc of kosAccounts) {
        const valid = done ? rand(3, 8) : rand(0, 4);
        const finished = done ? valid >= 5 : valid >= 5;
        const view = valid * rand(2000, 9000);
        const digg = Math.floor(view * (rand(3, 8) / 100));
        await prisma.koxTaskAuthor.create({
          data: {
            taskId,
            accountId: acc.id,
            validItemCount: valid,
            violationCount: Math.random() < 0.1 ? 1 : 0,
            viewCount: view,
            displayCount: view * rand(6, 12),
            diggCount: digg,
            interaction: digg + Math.floor(digg / rand(4, 9)),
            ces: valid * rand(50, 120),
            finished,
          },
        });
      }
    }
    for (const acc of allAccounts.filter((a) => a.accountType === 'KOC')) {
      await prisma.koxTaskAuthor.create({
        data: {
          taskId: task2.id,
          accountId: acc.id,
          validItemCount: 2,
          viewCount: 56000,
          displayCount: 480000,
          diggCount: 6800,
          interaction: 8100,
          ces: 190,
          finished: false,
        },
      });
    }

    const stats = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(Date.now() - i * day);
      const w = d.getDay();
      const weekendBoost = w === 0 || w === 6 ? 1.35 : 1;
      const growth = 1 + (59 - i) * 0.006;
      const item = Math.round(rand(28, 46) * weekendBoost * growth);
      const view = item * rand(2600, 4800);
      const inter = Math.floor(view * 0.043);
      stats.push({
        statDate: d,
        platform: 'all',
        authorNum: 10 + Math.floor((59 - i) / 12),
        itemCnt: item,
        crazyItemCnt: Math.random() < 0.15 ? rand(1, 3) : 0,
        toolItemCntSum: Math.floor(item * 0.72),
        followCountSum: rand(800, 2100),
        exposureSum: view * rand(8, 14),
        viewSum: view,
        interactionSum: inter,
        totalPmInquiries: rand(120, 320),
        totalPmOpenings: rand(200, 480),
        totalPmLeads: rand(38, 95),
        toolClickCnt: rand(420, 980),
        formLeads: rand(12, 40),
        adCost: rand(1800, 4200),
        adViewSum: Math.round(view * 0.22),
        adConversions: rand(22, 60),
        liveAccountNum: 6 + Math.floor((59 - i) / 20),
        liveCount: rand(3, 9),
        liveValidDuration: rand(9, 22) * 3600,
        liveExposureUv: rand(90000, 260000),
        liveWatchUv: rand(12000, 40000),
        liveToolClickCnt: rand(900, 2600),
        liveTotalLeads: rand(60, 160),
        liveFormLeads: rand(18, 55),
        liveCost: rand(1200, 3200),
      });
    }
    await prisma.koxDailyStat.createMany({ data: stats });

    const monthNow = new Date().toISOString().slice(0, 7);
    const prev = new Date(Date.now() - 30 * day);
    const monthPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const dealers = [
      ['广州天河经销商', 186, 412],
      ['上海徐汇经销商', 172, 386],
      ['北京朝阳经销商', 165, 359],
      ['深圳南山经销商', 148, 334],
      ['成都锦江经销商', 132, 301],
      ['杭州西湖经销商', 121, 288],
      ['天津和平经销商', 96, 214],
      ['南京鼓楼经销商', 88, 206],
      ['佛山顺德经销商', 74, 168],
      ['重庆渝中经销商', 63, 149],
    ];
    const salesRows = [];
    for (const [month, mul] of [[monthNow, 0.72], [monthPrev, 1]]) {
      for (const [dealer, sales, leads] of dealers) {
        salesRows.push({
          month,
          dealerName: dealer,
          modelName: '华帝烟灶套装',
          totalSales: Math.round(sales * mul * (0.9 + Math.random() * 0.2)),
          leadsCount: Math.round(leads * mul * (0.9 + Math.random() * 0.2)),
        });
      }
    }
    await prisma.koxDealerSales.createMany({ data: salesRows });

    console.log(
      `Seeded KOX: ${accountRows.count} accounts + 3 tasks + ${stats.length} daily stats + ${salesRows.length} dealer sales`,
    );
  }

  const existingInsight = await prisma.insightContent.count();
  if (existingInsight === 0) {
    const day = 24 * 60 * 60 * 1000;
    const rand = (min, max) => min + Math.floor(Math.random() * (max - min));

    const dailyStats = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(Date.now() - i * day);
      const w = d.getDay();
      const boost = w === 0 || w === 6 ? 1.3 : 1;
      const content = Math.round(rand(18, 42) * boost);
      const view = content * rand(8000, 22000);
      dailyStats.push({
        statDate: d,
        platform: 'all',
        contentCnt: content,
        mentionCnt: Math.round(content * rand(2, 5)),
        viewSum: view,
        likeSum: Math.floor(view * 0.038),
        commentSum: Math.floor(view * 0.006),
        shareSum: Math.floor(view * 0.003),
        negativeCnt: Math.random() < 0.6 ? rand(0, 3) : 0,
      });
    }
    await prisma.insightDailyStat.createMany({ data: dailyStats });

    const contentSeeds = [
      ['华帝烟灶真实使用一个月，吸力确实顶', '厨房老王', 'KOC', 'douyin', 'video', 'positive'],
      ['装修避坑：选烟机别只看颜值（附华帝对比）', '装修一点通', 'KOC', 'xhs', 'note', 'neutral'],
      ['华帝自清洁是噱头吗？实测拆机看油污', '家电拆解室', 'KOC', 'douyin', 'video', 'neutral'],
      ['新房烟灶安装全过程记录', '小鹿的新家', 'KOC', 'xhs', 'note', 'positive'],
      ['吐槽一下我家烟灶：噪音比想象大', '奶爸日常', 'KOC', 'xhs', 'note', 'negative'],
      ['华帝门店直播专场：套装直降800', '华帝官方旗舰店', 'OFFICIAL', 'douyin', 'live', 'positive'],
      ['蒸烤一体机做欧包，小白也能成功', '烘焙研究所', 'KOC', 'xhs', 'note', 'positive'],
      ['华帝蒸烤机一个月使用报告', '爱下厨的琳达', 'KOC', 'douyin', 'video', 'positive'],
      ['售后体验分享：师傅上门很及时', '广州业主群', 'KOC', 'xhs', 'note', 'positive'],
      ['烟灶联动功能翻车了？可能是你没设置对', '智能家居控', 'KOC', 'douyin', 'video', 'neutral'],
      ['华帝vs方太横向对比测评', '厨电测评君', 'KOC', 'douyin', 'video', 'neutral'],
      ['双11烟灶选购指南：三档预算方案', '省钱装修指南', 'KOC', 'xhs', 'note', 'positive'],
      ['华帝新品发布会看点：火力升级', '科技早知道', 'KOC', 'douyin', 'video', 'positive'],
      ['用了三年的华帝灶，说说真实感受', '老用户说真话', 'KOC', 'xhs', 'note', 'neutral'],
      ['华帝孝心焕新活动：以旧换新攻略', '华帝官方', 'OFFICIAL', 'xhs', 'note', 'positive'],
      ['烟机清洗预约流程太复杂了', '忙碌上班族', 'KOC', 'xhs', 'note', 'negative'],
      ['华帝KOS导购的一天：门店vlog', '华帝·天河旗舰店', 'KOS', 'douyin', 'video', 'positive'],
      ['嵌入式蒸烤一体机安装注意事项', '装修监理老李', 'KOC', 'douyin', 'video', 'neutral'],
      ['华帝套装晒单：颜值和实力并存', '新居生活家', 'KOC', 'xhs', 'note', 'positive'],
      ['蒸烤机做宝宝辅食一周不重样', '宝妈小课堂', 'KOC', 'xhs', 'note', 'positive'],
      ['华帝直播切片：主厨现场演示猛火爆炒', '华帝官方旗舰店', 'OFFICIAL', 'douyin', 'video', 'positive'],
      ['华帝烟灶使用半年后的缺点汇总', '理性消费者', 'KOC', 'douyin', 'video', 'negative'],
      ['小红书爆文拆解：华帝种草笔记套路', '运营观察员', 'KOC', 'xhs', 'note', 'neutral'],
      ['华帝×装修博主联名探访视频上线', '家居潮流志', 'KOC', 'douyin', 'video', 'positive'],
      ['老厨房改造：换华帝烟灶值不值', '改造家计划', 'KOC', 'xhs', 'note', 'positive'],
      ['蒸烤一体机烘焙失败案例分析', '面包踩坑记', 'KOC', 'xhs', 'note', 'neutral'],
      ['华帝中秋团圆宴直播预告', '华帝官方', 'OFFICIAL', 'douyin', 'live', 'positive'],
      ['门店探店：华帝体验中心实拍', '探店小分队', 'KOC', 'douyin', 'video', 'positive'],
      ['华帝烟灶套装开箱+安装避雷', '开箱实验室', 'KOC', 'xhs', 'note', 'neutral'],
      ['618华帝战绩复盘：社媒声量翻倍', '营销数据控', 'KOC', 'xhs', 'note', 'positive'],
    ];
    await prisma.insightContent.createMany({
      data: contentSeeds.map(([title, author, authorType, platform, type, sentiment], i) => {
        const views = rand(20000, 1200000);
        return {
          platform,
          contentType: type,
          title,
          authorName: author,
          authorType,
          publishAt: new Date(Date.now() - rand(1, 30) * day - i * 3600 * 1000),
          views,
          likes: Math.floor(views * 0.042),
          comments: Math.floor(views * 0.005),
          shares: Math.floor(views * 0.003),
          collects: Math.floor(views * 0.008),
          sentiment,
        };
      }),
    });

    await prisma.insightReport.createMany({
      data: [
        {
          name: '华帝品牌监测周报 W34',
          period: '2026-08 W34',
          access: 'public',
          createdById: admin.id,
          createdAt: new Date(Date.now() - 3 * day),
        },
        {
          name: '华帝社媒声量月报 2026-07',
          period: '2026-07',
          access: 'password',
          createdById: admin.id,
          createdAt: new Date(Date.now() - 26 * day),
        },
        {
          name: '竞品对比专项报告：烟灶类目',
          period: '2026-Q3',
          access: 'private',
          createdById: sales.id,
          createdAt: new Date(Date.now() - 12 * day),
        },
      ],
    });

    console.log(
      `Seeded insight: ${contentSeeds.length} contents + ${dailyStats.length} stats + 3 reports`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
