#!/usr/bin/env node
// 演示工作区初始化：brand 10 东风日产Nissan / brand 11 宠物（幂等，可重跑）
// 做四件事：
//   1. Brand 行（挂现有公司；显式 id 10/11，随后把 id 序列拨到 max(id) 防自增撞号）
//   2. BrandMember：把 brand 1（演示区）与 brand 9（东风日产投标区）的成员镜像进来（含超管）
//   3. BrandQuota：演示算力池（混剪10/AI成片50/图文生成 按次扣）
//   4. Product：日产=东风日产N7；宠物=宠物零食/羊奶粉两件（视频工坊选品用）
// 仅操作这四类行，不碰业务数据表；文案改写与市场数据见 copy-df-to-demo.cjs
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

const BRANDS = [
  {
    id: 10,
    name: '东风日产Nissan工作区',
    description: '东风日产Nissan 演示工作区（2026-11-19）：市场数据为东风奕境 mock，素材库=N7 素材',
    product: {
      name: '东风日产N7',
      displayName: '日产N7',
      description: '东风日产 N7 纯电轿车——15万级家用纯电标杆',
      knowledge: `东风日产N7：合资纯电轿车。核心卖点：
1. 越级大空间：轴距2.9米级，后排纯平地台，全家出行无压力；
2. 舒适沙发座：日产大沙发基因，前排零重力座椅，主驾12向电动调节；
3. 长续航真省心：CLTC 最高625km，全系支持快充，电量30%-80%约25分钟；
4. 智能座舱：15.6英寸2.5K中控大屏，高通骁龙8295P芯片，语音响应流畅；
5. 智驾辅助：L2+级智能驾驶辅助，高速领航/自动泊车都有；
6. 质价比：15万级价格、合资品质保障，东风日产大厂服务网络。`,
    },
  },
  {
    id: 11,
    name: '宠物项目工作区',
    description: '宠物行业 演示工作区（2026-11-19）：市场数据为东风奕境 mock 宠物化改写，素材库=宠物热门视频',
    product: {
      name: '冻干鸡肉粒',
      displayName: '冻干鸡肉粒·狗狗零食',
      description: '宠物零食——单一肉源冻干，日常奖励/拌粮均可',
      knowledge: `冻干鸡肉粒：狗狗零食大单品。核心卖点：
1. 单一肉源：精选鸡胸肉，-40℃冻干锁鲜，0添加0诱食剂；
2. 高蛋白低脂：粗蛋白≥68%，幼犬成犬都适用；
3. 日常好喂：训练奖励、拌粮提食欲皆可，密封罐装好保存；
4. 适口性实测：挑食犬拌粮实测光盘率98%。`,
    },
    product2: {
      name: '宠物羊奶粉',
      displayName: '宠物羊奶粉·幼猫幼犬营养',
      description: '幼猫幼犬营养补充——低敏好吸收',
      knowledge: `宠物羊奶粉：幼宠营养大单品。核心卖点：
1. 低敏配方：羊乳小分子，乳糖不耐的猫狗也能喝；
2. 营养全面：DHA助发育+益生菌护肠胃，幼猫幼犬/孕犬/老年宠物通用；
3. 好冲泡：40℃温水即冲即溶不结块。`,
    },
  },
];

const QUOTA_TOTAL = Number(process.env.DEMO_QUOTA_TOTAL ?? 100000);

const prisma = new PrismaClient();

async function main() {
  if (!/\/saas_prod(\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 未指向 saas_prod——本脚本仅应在服务器上对 saas_prod 执行');
  }
  // 参照公司：取 brand9（东风日产投标区）的公司，兜底 brand7
  const refBrand = (await prisma.brand.findUnique({ where: { id: 9 } })) ?? (await prisma.brand.findUnique({ where: { id: 7 } }));
  if (!refBrand) throw new Error('找不到参照品牌(9/7)，无法确定 companyId');

  for (const b of BRANDS) {
    const existed = await prisma.brand.findUnique({ where: { id: b.id } });
    if (existed) {
      await prisma.brand.update({ where: { id: b.id }, data: { name: b.name, description: b.description, status: 1 } });
      console.log(`Brand ${b.id} 已存在 → 更新名称/描述: ${b.name}`);
    } else {
      await prisma.brand.create({ data: { id: b.id, companyId: refBrand.companyId, name: b.name, description: b.description, status: 1 } });
      console.log(`Brand ${b.id} 已创建: ${b.name}`);
    }

    // 成员：镜像 brand1/brand9 的成员（去重）
    const donors = await prisma.brandMember.findMany({ where: { brandId: { in: [1, 9] } } });
    let added = 0;
    for (const m of donors) {
      const dup = await prisma.brandMember.findFirst({ where: { brandId: b.id, userId: m.userId, roleKey: m.roleKey } });
      if (!dup) {
        await prisma.brandMember.create({ data: { brandId: b.id, userId: m.userId, roleKey: m.roleKey } });
        added += 1;
      }
    }
    const totalMembers = await prisma.brandMember.count({ where: { brandId: b.id } });
    console.log(`  BrandMember: 镜像新增 ${added}，现有 ${totalMembers}`);

    // 算力池
    const q = await prisma.brandQuota.findUnique({ where: { brandId: b.id } });
    if (!q) {
      await prisma.brandQuota.create({ data: { brandId: b.id, total: QUOTA_TOTAL, used: 0 } });
      console.log(`  BrandQuota: 创建 演示算力池 ${QUOTA_TOTAL}`);
    } else if (q.total < QUOTA_TOTAL) {
      await prisma.brandQuota.update({ where: { brandId: b.id }, data: { total: QUOTA_TOTAL } });
      console.log(`  BrandQuota: 总量提到 ${QUOTA_TOTAL}（原 ${q.total}）`);
    } else {
      console.log(`  BrandQuota: 已有 total=${q.total} used=${q.used}，不动`);
    }

    // 产品（视频工坊/图文生产选品用）
    for (const p of [b.product, b.product2].filter(Boolean)) {
      const dup = await prisma.product.findFirst({ where: { brandId: b.id, name: p.name } });
      if (!dup) {
        await prisma.product.create({
          data: {
            brandId: b.id, name: p.name, displayName: p.displayName,
            description: p.description, knowledge: p.knowledge, configType: 'product',
          },
        });
        console.log(`  Product: 创建 ${p.name}`);
      } else {
        await prisma.product.update({
          where: { id: dup.id },
          data: { displayName: p.displayName, description: p.description, knowledge: p.knowledge },
        });
        console.log(`  Product: 已存在 → 更新文案 ${p.name}`);
      }
    }
  }

  // id 序列拨到 max(id)，防止后续自增主键与显式 10/11 撞号
  const maxId = await prisma.brand.aggregate({ _max: { id: true } });
  const next = (maxId._max.id ?? 0) + 1;
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Brand"', 'id'), ${next}, false)`);
  console.log(`Brand id 序列已拨到 ${next}`);

  console.log('\n完成：brand 10/11 工作区就绪');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
