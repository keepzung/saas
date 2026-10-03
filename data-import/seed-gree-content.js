// 格力工作区(brandId=8) 内容工厂种子：创作策略 7 条（按东风样式合成，空调场景）+ 素材套图/标签组
// 旧系统格力策略为空（dumps/869 无数据），本文件按东风 7 条策略的结构合成格力话术，客户可在后台直接改。
// 幂等：按 brandId+name 判重。用法: node seed-gree-content.js [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const BRAND_ID = Number(process.env.BRAND_ID ?? 8);
const DRY_RUN = process.argv.includes('--dry-run');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ─── 格力创作策略（按东风样式合成，空调家装场景）─────────────────────────
const GREE_STRATEGIES = [
  {
    name: '从业多年的老销售',
    description: '老销售给正在纠结「装中央空调还是买分体」的客户算一笔账，重点讲一拖多的长期电费账和十年免费包修的保障。',
    persona: ['从业十多年的格力老销售，见过各种纠结中央空调的客户，说话实在爱算账'],
    sellingPoints: ['家用空调整机十年免费包修，后期维护零顾虑', '一拖多中央空调，全屋一台外机，墙面更清爽', '全直流变频，长期开比分体机更省电', '隐藏式安装，吊顶里不占地方，颜值高'],
    audience: ['正在装修纠结空调方案的家庭客户'],
    contentDirections: [{ name: '客资收集场景', description: '老销售借真实案例讲清方案差异，自然引导私信量房' }],
    enabled: true, sort: 1,
  },
  {
    name: '直爽90后销售',
    description: '90后销售用算账方式讲给怕多花冤枉钱的年轻人，重点算电费、以旧换新补贴和十年包修，结论先行不绕弯。',
    persona: ['直爽的90后销售，不绕弯子，张嘴就是数字和结论'],
    sellingPoints: ['以旧换新国家补贴，最高立减两成', '一级能效全直流变频，夏天整月开也不心疼电费', '十年免费包修，坏了不用花一分钱', 'AI 智能温控，到家前十分钟先凉快好'],
    audience: ['怕被套路的年轻装修党', '第一次装中央空调的刚需用户'],
    contentDirections: [{ name: '购车算账', description: '用算账方式讲清补贴与电费，引导私信咨询报价' }],
    enabled: true, sort: 2,
  },
  {
    name: '专注家装的方案顾问',
    description: '家装渠道顾问讲给正在装修的业主，重点讲水电配合、吊顶时机和机型选配，突出「装修阶段装中央空调最划算」。',
    persona: ['专注家装渠道的方案顾问，懂装修工序和水电配合'],
    sellingPoints: ['装修进场前定方案，水电一次到位不返工', '超薄机身吊顶不压层高，小户型也友好', '一房一方案，G+ 图纸免费出', ' Star 5 AI 家庭中央空调，温湿度联动更舒适'],
    audience: ['正在装修的业主', '全屋定制阶段的家庭用户'],
    contentDirections: [{ name: '家庭场景种草', description: '从装修工序切入讲方案，引导到店看样机' }],
    enabled: true, sort: 3,
  },
  {
    name: '懂生活的小姐姐',
    description: '懂生活的女销售用女生视角讲给注重颜值与体感的家庭，重点讲隐蔽安装、静音和温湿舒适，种草后引导量房。',
    persona: ['懂生活的格力女销售，审美在线，最在意居住舒适感'],
    sellingPoints: ['出风口藏在吊顶里，全屋看不到一台柜挂机', '低至 22 分贝静音，睡觉没存在感', '恒温除湿不干燥，梅雨季墙角不返潮', 'AI 节能模式，人走自动调温'],
    audience: ['注重颜值与舒适的女性业主', '有宝宝对温湿敏感的家庭'],
    contentDirections: [{ name: '颜值种草', description: '用女生视角讲隐蔽安装与舒适体感，种草后引导私信' }],
    enabled: true, sort: 4,
  },
  {
    name: '资深门店店长',
    description: '店长帮第一次装中央空调的用户算总账：设备+安装+十年包修+电费，说明装得值、用着省。',
    persona: ['资深门店店长，最会帮第一次装中央空调的用户算总账'],
    sellingPoints: ['设备+安装一口价，没有隐形收费', '十年免费包修写进合同，长期持有放心', '夏季电费实测账单晒给你看', '老客户转介绍多，口碑装出来'],
    audience: ['第一次装中央空调的用户'],
    contentDirections: [{ name: '购车算账', description: '店长帮用户算总账，讲清装得值，引导留资' }],
    enabled: true, sort: 5,
  },
  {
    name: '老房改造专家组',
    description: '门店运营讲给老房加装/换新用户，重点讲不吊顶方案、以旧换新流程和两天完工，打消「装修完了装不了」的顾虑。',
    persona: ['门店运营人员，专攻老房改造与换新方案'],
    sellingPoints: ['局部吊顶/无主灯方案，老房也能装中央空调', '以旧换新一站式：拆旧+补贴+新机一次搞定', '标准两居室最快两天完工', 'GMV9 智岳多联机组，老房电压也带得动'],
    audience: ['老房翻新业主', '想给旧分体机换新的家庭'],
    contentDirections: [{ name: '改造案例', description: '用真实改造案例打消顾虑，引导上门勘测' }],
    enabled: true, sort: 6,
  },
  {
    name: '大平层别墅方案专家',
    description: '家庭出行规划师式的大宅顾问讲给大平层/别墅业主，重点讲多联机分区控制、新风联动与全屋方案，体现专业与格调。',
    persona: ['大宅方案专家，服务过大平层与别墅业主，懂全屋空气方案'],
    sellingPoints: ['GMV9 智岳多联机组，大户型分区控制更省电', '中央空调+新风+地暖联动，全屋空气一站式', '客餐厅+卧室独立温控，各过各的四季', '专属设计师上门，G+ 效果图先看效果'],
    audience: ['大平层/别墅业主', '对全屋空气方案有要求的改善型用户'],
    contentDirections: [{ name: '大宅方案', description: '从全屋空气方案讲专业度，引导到店深度沟通' }],
    enabled: true, sort: 7,
  },
];

// ─── 素材套图/标签组（图片走上传/URL 导入通道，先建组）──────────────────
const GREE_SETS = [
  { name: '产品实拍图', status: 1 },
  { name: '安装场景图', status: 1 },
];
const GREE_TAGS = [
  { name: '产品图', status: 1 },
  { name: '场景图', status: 1 },
];

async function main() {
  const prisma = new PrismaClient();
  const summary = { strategies: 0, sets: 0, tags: 0, skipped: 0 };
  try {
    for (const st of GREE_STRATEGIES) {
      const exists = await prisma.writingStrategy.findFirst({ where: { brandId: BRAND_ID, name: st.name } });
      if (exists) { summary.skipped++; continue; }
      if (!DRY_RUN) {
        await prisma.writingStrategy.create({
          data: {
            brandId: BRAND_ID,
            name: st.name,
            description: st.description,
            persona: st.persona,
            sellingPoints: st.sellingPoints,
            audience: st.audience,
            contentDirections: st.contentDirections,
            enabled: st.enabled,
            sort: st.sort,
            createdById: null,
          },
        });
      }
      summary.strategies++;
    }
    for (const s of GREE_SETS) {
      const exists = await prisma.materialImageSet.findFirst({ where: { brandId: BRAND_ID, name: s.name } });
      if (exists) { summary.skipped++; continue; }
      if (!DRY_RUN) await prisma.materialImageSet.create({ data: { brandId: BRAND_ID, name: s.name, status: s.status } });
      summary.sets++;
    }
    for (const t of GREE_TAGS) {
      const exists = await prisma.materialTypeTag.findFirst({ where: { brandId: BRAND_ID, name: t.name } });
      if (exists) { summary.skipped++; continue; }
      if (!DRY_RUN) await prisma.materialTypeTag.create({ data: { brandId: BRAND_ID, name: t.name, status: t.status } });
      summary.tags++;
    }
    console.log(`格力内容种子${DRY_RUN ? '（dry-run）' : ''}:`, summary);
    if (!DRY_RUN) {
      const [strategies, sets, tags, products] = await Promise.all([
        prisma.writingStrategy.count({ where: { brandId: BRAND_ID } }),
        prisma.materialImageSet.count({ where: { brandId: BRAND_ID } }),
        prisma.materialTypeTag.count({ where: { brandId: BRAND_ID } }),
        prisma.product.count({ where: { brandId: BRAND_ID } }),
      ]);
      console.log(`brand ${BRAND_ID} 现状: 策略 ${strategies} / 套图 ${sets} / 标签 ${tags} / 产品 ${products}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-gree-content failed:', e.message || e);
  process.exit(1);
});
