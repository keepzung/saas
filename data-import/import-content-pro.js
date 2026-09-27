#!/usr/bin/env node
// 内容工厂Pro + 内容创作任务 种子（东风奕境 brandId=7 / 格力 brandId=8）
// 来源：tools/crawl-marketine/dumps/867|869（旧系统 saas.marketine.cn 真后端爬盘）
//   + 东风、格力旧系统截图.pptx 图3/图4 转录的 7 条创作策略（策略详情为旧系统卡片可见文案，卖点/人设/受众按卡片计数合成，UI 可编辑）
// 内容（幂等，重跑不重复）：
//   - 产品三级树（brand→series→product，含 knowledge/salesPolicy/faq）
//   - 素材类型标签（外观/内饰）+ 套图（外-波尔多紫 等 5 套，仅东风）
//   - 素材图片：history-xhs img_list 的真实旧图 URL（可公开访问，已验证 200）
//   - 创作策略 7 条（东风）；格力无策略（旧系统为空）
//   - XhsHistory 生成历史 2 篇（东风）
// 用法: node import-content-pro.js [--company 867|869|all] [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const cIdx = process.argv.indexOf('--company');
const COMPANY = cIdx > -1 ? process.argv[cIdx + 1] : 'all';
const DUMPS = path.resolve(__dirname, '../tools/crawl-marketine/dumps');

// company → brandId 映射（旧系统 main_company_id → 新系统 Brand.id）
const COMPANY_BRAND = { 867: 7, 869: 8 };

// ─── 东风创作策略（图3/图4 卡片文案转录）─────────────────────────────
const DF_STRATEGIES = [
  {
    name: '从业多年的老销售',
    description: '老销售用从业多年的经验，给正在纠结下手时机的家用换车客户算一笔账，重点讲这次预售权益的力度和怎么用最划算。',
    persona: ['从业多年的老销售，见过各种纠结换车时机的客户，说话接地气爱算账'],
    sellingPoints: ['预售权益力度：2000 意向金抵 5000 购车款，等于车价直接少三千', '质保——整车加三电终身质保，跟首任非营运车主走，长期账', '先享礼——锁单后优先排产交付，热门配置不用排在后面'],
    audience: ['正在纠结早提车还是等上市的家用换车客户'],
    contentDirections: [{ name: '客资收集场景', description: '老销售借具体场景讲清卖点，自然引导私信留资' }],
    enabled: true, sort: 1,
  },
  {
    name: '直爽00后销售',
    description: '00后销售用算账的方式，讲给想省钱、怕被套路的年轻买家，重点讲预售权益的金额和质保，教大家怎么最划算。',
    persona: ['直爽的00后销售，不绕弯子，一张嘴就是数字和结论'],
    sellingPoints: ['预售权益金额实打实：膨膨礼 2000 抵 5000', '整车加三电终身质保，年轻人买车也要长期保障', '先享礼锁单优先排产，早定早提车'],
    audience: ['想省钱、怕被套路的年轻买家'],
    contentDirections: [{ name: '客资收集场景', description: '用算账方式讲清优惠，引导私信咨询具体方案' }],
    enabled: true, sort: 2,
  },
  {
    name: '专注SUV的销售',
    description: '家庭用车体验党讲给很多家庭等潜在购车用户，重点突出限时预售专属礼遇，结合大六座空间、储物和乘坐舒适的实际情况，强调现在锁单的福利感与先享权。',
    persona: ['专注SUV多年的销售', '自己也是家庭用车用户，懂带娃出行的痛点'],
    sellingPoints: ['限时预售专属礼遇，现在锁单福利感拉满', '大六座空间，二孩家庭全家出行不挤', '储物空间多，婴儿车/行李都装得下', '乘坐舒适，长途不累', '先享权：锁单优先排产交付'],
    audience: ['多口之家换车用户', '注重空间的二胎家庭', '经常全家自驾游的用户', '看重舒适性的家用买家', '预算 30 万级家庭用户'],
    contentDirections: [{ name: '家庭场景种草', description: '从家庭用车场景切入，突出空间与舒适，引导到店试驾' }],
    enabled: true, sort: 3,
  },
  {
    name: '颜值种草的女销售',
    description: '高颜值共情型汽车女销售，用女生视角讲给注重外观内饰的女性购车群体和家庭决策者，重点讲车身颜色、内饰氛围、双联屏和车灯这些看得见摸得着的颜值细节。',
    persona: ['高颜值共情型汽车女销售', '审美在线，懂女生买车时在意的每一个细节'],
    sellingPoints: ['波尔多紫/阿尔卑斯白/里斯本黑三种车身颜色，怎么拍都出片', '内饰氛围感拉满，晨光白/赤霞橙双色可选', '双联屏设计，科技感与颜值兼备', '大灯造型辨识度高，晚上点亮很好看'],
    audience: ['注重外观内饰的女性购车群体', '家庭购车决策中的审美担当'],
    contentDirections: [{ name: '颜值种草', description: '用女生视角讲颜值细节，种草后引导私信看车' }],
    enabled: true, sort: 4,
  },
  {
    name: '资深门店店长',
    description: '福利分享官用算账的方式，讲给第一次买这款车的用户，重点算预售权益、续航和充电成本，说明这车买得值。',
    persona: ['资深门店店长，福利分享官，最会帮第一次买车的用户算总账'],
    sellingPoints: ['预售权益+选装权益一起算，落地省多少一目了然', '增程长续航，日常通勤当电车开，成本极低', '充电成本账：家充桩一夜几块钱', '首任车主三电终身质保，长期持有放心'],
    audience: ['第一次买这款车的用户'],
    contentDirections: [{ name: '购车算账', description: '店长帮用户算总账，讲清买得值，引导留资' }],
    enabled: true, sort: 5,
  },
  {
    name: '智能驾驶到底多省心',
    description: '门店运营人员用演示和讲解的方式，讲给科技尝鲜型车主和商务用户，重点讲华为乾崑智驾的传感器配置和智能驾驶能力，体现科技形象与出行效率。',
    persona: ['门店运营人员，智驾功能演示担当'],
    sellingPoints: ['华为乾崑智驾 ADS 5，4 激光雷达 + 32 个高性能传感器', 'NCA 随时随地可激活，乡村土路/环岛/地库都能开', '车位到车位 3.0，更多车位一键到位', '全向防碰撞系统 CAS 5.0，大车好停又安全'],
    audience: ['科技尝鲜型车主', '注重出行效率的商务用户', '对智驾感兴趣的年轻用户'],
    contentDirections: [{ name: '智驾演示', description: '用演示和讲解方式展示智驾能力，引导到店体验' }],
    enabled: false, sort: 6,
  },
  {
    name: '商务接待面子舒适都要',
    description: '家庭出行规划师讲给商务接待用车者，重点讲豪华内饰、静谧座舱和智能科技，体现商务形象与乘坐体验。',
    persona: ['家庭出行规划师，懂商务接待的门面与里子'],
    sellingPoints: ['豪华内饰+静谧座舱，接待客户有面子', '智能座舱鸿蒙生态，商务出行效率高', '后排乘坐体验讲究，客户坐得舒服谈得顺畅'],
    audience: ['商务接待用车者', '企业主/个体老板'],
    contentDirections: [{ name: '商务场景', description: '从商务接待场景讲豪华与舒适，引导到店品鉴' }],
    enabled: false, sort: 7,
  },
];

const readJson = (company, name) => {
  const p = path.join(DUMPS, String(company), name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
};

// "{a,b,c}" → [a,b,c]（旧系统 PostgreSQL 数组文本）
const pgArr = (v) => {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v;
  let s = String(v).trim();
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

async function upsertProductTree(brandId, tree) {
  let created = 0;
  for (const b of tree) {
    let brandNode = await prisma.product.findFirst({ where: { brandId, configType: 'brand', name: b.display_name } });
    if (!brandNode) {
      if (DRY_RUN) { brandNode = { id: -1 }; } else {
        brandNode = await prisma.product.create({ data: { brandId, configType: 'brand', name: b.display_name, displayName: b.display_name, description: b.description || null, sort: b.sort_order ?? 1 } });
      }
      created++;
    }
    for (const s of b.children ?? []) {
      let seriesNode = await prisma.product.findFirst({ where: { brandId, configType: 'series', name: s.display_name, parentId: DRY_RUN ? null : brandNode.id } });
      if (!seriesNode) {
        if (DRY_RUN) { seriesNode = { id: -1 }; } else {
          seriesNode = await prisma.product.create({ data: { brandId, configType: 'series', name: s.display_name, displayName: s.display_name, parentId: brandNode.id, sort: s.sort_order ?? 1 } });
        }
        created++;
      }
      for (const n of s.children ?? []) {
        const info = n.basic_info ?? {};
        const exists = await prisma.product.findFirst({ where: { brandId, configType: 'product', name: n.display_name } });
        if (!exists) {
          if (!DRY_RUN) {
            await prisma.product.create({
              data: {
                brandId, configType: 'product', name: n.display_name, displayName: n.display_name,
                parentId: seriesNode.id === -1 ? null : seriesNode.id,
                description: n.description || null,
                knowledge: info.knowledge || null,
                salesPolicy: info.sales_policy || null,
                faq: info.faq || null,
                sort: n.sort_order ?? 1,
              },
            });
          }
          created++;
        }
      }
    }
  }
  return created;
}

async function seedCompany(company) {
  const brandId = COMPANY_BRAND[company];
  if (!brandId) { console.log(`未知 company ${company}，跳过`); return; }
  console.log(`\n=== company ${company} → brandId ${brandId} ===`);
  const summary = {};

  // 1) 产品三级树
  const tree = readJson(company, 'products.json');
  if (Array.isArray(tree) && tree.length) {
    summary.products = await upsertProductTree(brandId, tree);
    console.log(`产品树: 新建 ${summary.products} 节点`);
  }

  // 2) 素材类型标签
  const tagResp = readJson(company, 'material-type-tags.json');
  for (const t of tagResp?.list ?? []) {
    const exists = await prisma.materialTypeTag.findFirst({ where: { brandId, name: t.name } });
    if (!exists) {
      if (!DRY_RUN) await prisma.materialTypeTag.create({ data: { brandId, name: t.name, parentId: t.parent_id ?? 0, status: t.status ?? 1, perSetting: t.per_setting ?? 0 } });
      summary.tags = (summary.tags ?? 0) + 1;
    }
  }
  console.log(`素材类型标签: 新建 ${summary.tags ?? 0}`);

  // 3) 素材套图
  const setResp = readJson(company, 'material-image-sets.json');
  for (const s of setResp?.list ?? []) {
    const exists = await prisma.materialImageSet.findFirst({ where: { brandId, name: s.name } });
    if (!exists) {
      if (!DRY_RUN) await prisma.materialImageSet.create({ data: { brandId, name: s.name, status: s.status ?? 1 } });
      summary.sets = (summary.sets ?? 0) + 1;
    }
  }
  console.log(`素材套图: 新建 ${summary.sets ?? 0}`);

  // 4) 创作策略（东风转录；格力旧系统为空不造）
  if (company === 867) {
    for (const st of DF_STRATEGIES) {
      const exists = await prisma.writingStrategy.findFirst({ where: { brandId, name: st.name } });
      if (!exists) {
        if (!DRY_RUN) {
          await prisma.writingStrategy.create({
            data: {
              brandId, name: st.name, description: st.description, persona: st.persona,
              sellingPoints: st.sellingPoints, audience: st.audience,
              contentDirections: st.contentDirections, enabled: st.enabled, sort: st.sort,
            },
          });
        }
        summary.strategies = (summary.strategies ?? 0) + 1;
      }
    }
  }
  console.log(`创作策略: 新建 ${summary.strategies ?? 0}`);

  // 5) 生成历史 + 素材图片（从 history img_list 收集真实旧图 URL）
  const hist = readJson(company, 'history-xhs.json');
  let histCount = 0; let imgCount = 0;
  for (const h of hist?.list ?? []) {
    const exists = await prisma.xhsHistory.findFirst({ where: { brandId, title: h.title } });
    const tags = pgArr(h.tags);
    const imgList = pgArr(h.img_list);
    if (!exists) {
      if (!DRY_RUN) {
        await prisma.xhsHistory.create({
          data: {
            brandId, title: h.title, content: h.content ?? '', tags, imgList,
            conversationId: h.conversation_id ?? null,
            status: h.status ?? 0,
            uploadTime: h.upload_time ? new Date(h.upload_time) : new Date(),
            source: 'ai',
          },
        });
      }
      histCount++;
    }
    for (const url of imgList) {
      const imgExists = await prisma.materialImage.findFirst({ where: { brandId, url } });
      if (!imgExists) {
        if (!DRY_RUN) {
          await prisma.materialImage.create({ data: { brandId, url, name: decodeURIComponent(url.split('/').pop() ?? '素材图') } });
        }
        imgCount++;
      }
    }
  }
  console.log(`生成历史: 新建 ${histCount} 篇；素材图片(旧图直链): 新建 ${imgCount} 张`);

  if (!DRY_RUN) {
    const cnt = {
      products: await prisma.product.count({ where: { brandId } }),
      tags: await prisma.materialTypeTag.count({ where: { brandId } }),
      sets: await prisma.materialImageSet.count({ where: { brandId } }),
      images: await prisma.materialImage.count({ where: { brandId } }),
      strategies: await prisma.writingStrategy.count({ where: { brandId } }),
      history: await prisma.xhsHistory.count({ where: { brandId } }),
    };
    console.log(`当前库内 brandId=${brandId} 汇总:`, JSON.stringify(cnt));
  }
}

(async () => {
  const companies = COMPANY === 'all' ? [867, 869] : [Number(COMPANY)];
  for (const c of companies) await seedCompany(c);
  console.log(DRY_RUN ? '\n(dry-run 未写库)' : '\n完成');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
