#!/usr/bin/env node
// 东风日产(brandId=9) 工作区 + 内容工厂Pro + 内容创作任务 启用（幂等，可重跑）
// 范围：Brand 行 → ADMIN BrandMember → ModuleNode 确保 → BrandQuota 2000
//       → 素材类型标签×4 → 产品树×6 车系（初稿：公开资料整理，客户官方资料到位后替换）
//       → 创作策略×7（日产版初稿，前 5 启用、后 2 备用）→ 菜单授权
// 明确不做：素材图片（日产素材客户未提供，到位后单独导入）；不写其他品牌任何数据
// 用法: node enable-dfnissan-content-pro.js [--dry-run]
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
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

const DRY_RUN = process.argv.includes('--dry-run');
const BRAND_ID = 9;
const BRAND_NAME = '东风日产项目工作区';
const BRAND_SHORT = '东风日产';

// 素材类型标签 ×4（与东风/大众同款基线）
const TYPE_TAGS = ['整车外观', '前排内饰', '用车场景', '默认占位引导'];

// 产品树 ×6 车系（初稿：基于公开资料定性整理，不含具体价格/参数数字，待客户官方资料替换）
const PRODUCTS = [
  {
    name: '轩逸',
    knowledge: [
      '轩逸：东风日产家用轿车标杆，主打省油耐用与乘坐舒适，被称为「家轿之王」。',
      '座椅柔软舒适（零重力坐垫口碑），后排空间宽裕，适合家庭日常代步与通勤。',
      '油耗表现稳定，保养成本低，保有量大，二手车残值稳定。',
    ].join('\n'),
    salesPolicy: '现车销售，金融方案与置换补贴以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: 轩逸省油吗？ A: 日常通勤油耗表现稳定，是同级别里的省油口碑车型。\nQ: 适合家用吗？ A: 空间大、座椅舒适、保养便宜，是标准的家用定位。',
  },
  {
    name: '天籁',
    knowledge: [
      '天籁：东风日产中高级轿车，主打「大沙发」乘坐舒适性与静音表现。',
      'VC-Turbo 超变擎发动机，动力与油耗兼顾；底盘滤震高级，长途不累。',
      '适合商务接待与家庭高端用车场景。',
    ].join('\n'),
    salesPolicy: '限时权益与金融方案以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: 天籁和轩逸怎么选？ A: 预算充足要舒适与面子选天籁，务实家用选轩逸。\nQ: 跑长途舒服吗？ A: 座椅支撑和静音是强项，长途疲劳感低。',
  },
  {
    name: '奇骏',
    knowledge: [
      '奇骏：东风日产经典 SUV，通过性与空间兼顾，适合家庭出游与郊外用车。',
      '四驱系统口碑成熟，雪地烂路适应性强；座舱储物与后备箱实用。',
    ].join('\n'),
    salesPolicy: '置换补贴与试驾权益以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: 奇骏适合自驾游吗？ A: 通过性+空间+舒适性均衡，是家庭自驾的常青车型。',
  },
  {
    name: '逍客',
    knowledge: [
      '逍客：紧凑级 SUV，城市通勤灵活，底盘质感在欧洲团队调校下偏扎实。',
      '尺寸适中好停车，油耗低，年轻家庭首购热门。',
    ].join('\n'),
    salesPolicy: '首购金融方案以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: 女生开合适吗？ A: 车身尺寸适中、视野好、好停车，很适合首购用户。',
  },
  {
    name: '探陆',
    knowledge: [
      '探陆（Pathfinder）：东风日产旗舰大七座 SUV，主打多口之家与二胎家庭。',
      '2+2+3 座椅布局，第三排可真人乘坐；高速巡航稳定性好。',
    ].join('\n'),
    salesPolicy: '大七座专属权益以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: 第三排能坐大人吗？ A: 探陆第三排按真人乘坐设计，短途成年人无压力。',
  },
  {
    name: 'N7',
    knowledge: [
      'N7：东风日产新能源轿车，主打智能舒适出行，搭载智能座舱与辅助驾驶能力。',
      '针对新能源用户关注的续航、补能与舒适体验做了本地化调校。',
    ].join('\n'),
    salesPolicy: '新能源权益（充电/保养/置换）以门店当期政策为准（初稿占位，待官方政策替换）。',
    faq: 'Q: N7 续航怎么样？ A: 满足城市通勤+中短途出行，具体续航以官方公告为准（初稿占位）。',
  },
];

// 创作策略 ×7（参照东风/大众结构，日产版初稿；前 5 启用、后 2 备用）
const STRATEGIES = [
  {
    name: '从业多年的日产老销售',
    description: '老销售用多年经验帮纠结换车的家用客户算账，重点讲轩逸/奇骏的省油、耐用与保有量，把账算明白。',
    persona: ['从业多年的日产老销售，客户口碑靠回头客攒起来，说话接地气爱算账'],
    sellingPoints: ['日系品质省心耐用，保有量大保值省心', '油耗表现稳定，通勤成本可控', '座椅舒适，「大沙发」口碑不是白叫的', '门店置换补贴直接抵车款，手续省心'],
    audience: ['正在纠结换车时机的家用换车客户', '看重保有量和保值率的务实买家'],
    contentDirections: [{ name: '购车算账', description: '老销售借具体场景讲清卖点，自然引导私信留资' }],
    enabled: true, sort: 1,
  },
  {
    name: '直爽00后日产销售',
    description: '00后销售不绕弯子，讲给第一次买车的年轻买家，重点讲入门价格、配置实用性和用车成本，直接给结论。',
    persona: ['直爽的00后日产销售，不绕弯子，一张嘴就是数字和结论'],
    sellingPoints: ['入门门槛友好，首购预算压力小', '标配实用，不给必用功能加价', '保养便宜网点多，异地用车不慌', '二手残值稳，开几年换车不亏'],
    audience: ['第一次买车的年轻买家', '预算有限但想要合资品质的上班族'],
    contentDirections: [{ name: '首购种草', description: '用直接给结论的方式讲清性价比，引导私信问价' }],
    enabled: true, sort: 2,
  },
  {
    name: '专注SUV的家庭派',
    description: '家庭用车体验党讲给多口之家，重点突出奇骏/探陆的空间、舒适与安全，结合全家出行的真实场景。',
    persona: ['专注SUV多年的销售', '自己也是家庭用车用户，懂带娃出行的痛点'],
    sellingPoints: ['大五座/七座灵活布局，二孩家庭全家出行不挤', '后备箱装得下婴儿车+行李+露营装备', '底盘稳长途不累，老人小孩坐得舒服', '四驱版本雪地烂路更从容'],
    audience: ['多口之家换车用户', '注重空间的二胎家庭', '经常全家自驾游的用户'],
    contentDirections: [{ name: '家庭场景种草', description: '从家庭用车场景切入，突出空间与舒适，引导到店试驾' }],
    enabled: true, sort: 3,
  },
  {
    name: '颜值种草的日产女销售',
    description: '共情型女销售用女生视角讲给注重外观内饰的购车群体，重点讲车身颜色、内饰氛围和大屏细节。',
    persona: ['高颜值共情型汽车女销售', '审美在线，懂女生买车时在意的每一个细节'],
    sellingPoints: ['车身配色清新耐看，怎么拍都出片', '内饰氛围感在线，用料讲究', '大尺寸联屏，科技感与颜值兼备', '座椅柔软，长途坐车也舒服'],
    audience: ['注重外观内饰的女性购车群体', '家庭购车决策中的审美担当'],
    contentDirections: [{ name: '颜值种草', description: '用女生视角讲颜值细节，种草后引导私信看车' }],
    enabled: true, sort: 4,
  },
  {
    name: '资深门店店长',
    description: '福利分享官用算账方式讲给首次到店用户，重点算落地价、置换政策和用车成本，说明这车买得值。',
    persona: ['资深门店店长，福利分享官，最会帮第一次到店的用户算总账'],
    sellingPoints: ['现金优惠+置换补贴一起算，落地省多少一目了然', '金融方案灵活，月供压力小', '保险上牌一条龙，提车不折腾', '首任车主权益清单帮你列全'],
    audience: ['第一次到店的用户', '手上有旧车考虑置换的用户'],
    contentDirections: [{ name: '购车算账', description: '店长帮用户算总账，讲清买得值，引导留资' }],
    enabled: true, sort: 5,
  },
  {
    name: '新能源体验官',
    description: '门店新能源专员讲给科技尝鲜型用户，重点讲 N7 的智能座舱、辅助驾驶与新能源用车体验。',
    persona: ['门店新能源专员，智能座舱功能演示担当'],
    sellingPoints: ['智能座舱交互流畅，语音导航音乐免下手', '辅助驾驶能力覆盖高速通勤场景', '新能源用车成本低，家里充电更省', '合资大厂品质背书，新能源也省心'],
    audience: ['科技尝鲜型用户', '考虑从油车换新能源的家庭'],
    contentDirections: [{ name: '新能源体验', description: '用演示和讲解方式展示智能座舱与辅助驾驶，引导到店体验' }],
    enabled: false, sort: 6,
  },
  {
    name: '商务接待面子舒适都要',
    description: '家庭出行规划师讲给商务接待用车者，重点讲天籁的豪华内饰、静谧座舱和乘坐体验。',
    persona: ['家庭出行规划师，懂商务接待的门面与里子'],
    sellingPoints: ['稳重大气的外观，接待客户有面子', '静谧座舱+舒适悬架，客户坐得舒服谈得顺畅', '「移动大沙发」后排体验讲究，长途接待不怠慢', '油耗与保养成本可控，公司用车账好算'],
    audience: ['商务接待用车者', '企业主/个体老板'],
    contentDirections: [{ name: '商务场景', description: '从商务接待场景讲豪华与舒适，引导到店品鉴' }],
    enabled: false, sort: 7,
  },
];

// 品牌模板 ×4（模板体系四类初稿，品牌方评审后定稿；content 结构与 TemplateLibraryView 表单对齐）
const TEMPLATES = [
  {
    kind: 'script_spec',
    name: '东风日产品牌话术规范',
    summary: '品牌沟通的语言边界与风格基线，内容生成与私信对话全局引用',
    content: {
      tone: '专业热情、口语化、不卑不亢；以真实门店销售口吻沟通',
      dos: ['车型名/配置表述与产品库一致', '主动引导私信或到店', '强调真实体验与口碑'],
      donts: ['贬低竞品品牌', '承诺无法兑现的价格或权益', '使用绝对化用语（最/第一/绝对）'],
      vocabulary: ['东风日产', '到店体验', '落地价', '试驾'],
    },
    remark: 'v1 初稿（2026-11-17），品牌方评审后定稿',
  },
  {
    kind: 'vehicle_template',
    name: '日产车型内容通用模板',
    summary: '图文笔记通用结构模板，全部车系生效（可另配车系专属模板优先命中）',
    content: {
      titlePatterns: ['{车型}到底怎么选', '第一次了解{车型}看这篇', '{车型}值不值得入手'],
      sections: [
        { name: '钩子引入', requirement: '前两句制造代入感或悬念' },
        { name: '卖点展开', requirement: '覆盖策略卖点，用体验细节佐证' },
        { name: '场景带入', requirement: '放到具体用车场景里讲' },
        { name: '行动引导', requirement: '引导私信/到店/试驾' },
      ],
      cta: '想了解的私信我，帮你按情况算落地价',
    },
    remark: 'v1 初稿（2026-11-17）',
  },
  {
    kind: 'compliance_template',
    name: '东风日产合规审核模板',
    summary: '广告法与平台规则的生成前约束 + 出厂后校验清单',
    content: {
      bannedWords: ['最好', '第一', '绝对', '国家级', '全网最低', '百分百', '必买'],
      requiredChecks: ['价格表述有依据', '权益/政策与当期一致', '无虚假承诺'],
    },
    remark: 'v1 初稿（2026-11-17）',
  },
  {
    kind: 'persona',
    name: '门店销售人设通用模板',
    summary: 'KOS 账号真人风格人设卡（门店可按账号复制定制）',
    content: {
      identity: '从业多年的东风日产门店销售顾问',
      traits: ['热情', '爱聊车', '实在'],
      expertise: ['全车系配置', '购车金融方案', '保养售后'],
      expressions: ['自称「我」', '口头禅「给你交个底」'],
    },
    remark: 'v1 初稿（2026-11-17）',
  },
];

// 合规红线规则 ×4（动作：block=出厂拦截 / flag=强制重写；与生成预审、私信拦截共用）
const COMPLIANCE_RULES = [
  {
    name: '广告法绝对化用语',
    pattern: '最好,最佳,第一,顶级,绝对,百分百,全网最低,史上最,无人能比',
    action: 'block',
    replyHint: '',
  },
  {
    name: '权威背书违规',
    pattern: '国家级,国家认证,官方推荐,质检认定',
    action: 'flag',
    replyHint: '',
  },
  {
    name: '夸大承诺',
    pattern: '稳赚,必买,闭眼入, guaranteed, 无条件退款',
    action: 'flag',
    replyHint: '',
  },
  {
    name: '价格违规表述',
    pattern: '/(低价|降价|优惠)\\s*[0-9]*\\s*(万|元)起?(?!以门店)/',
    action: 'flag',
    replyHint: '具体价格以门店当期政策为准，我可以帮您算精准的落地价',
  },
];

const prisma = new PrismaClient();

async function ensureModuleNodes() {
  const factory = await prisma.moduleNode.findUnique({ where: { key: 'm_factory' } });
  const taskGroup = await prisma.moduleNode.findUnique({ where: { key: 'm_kox_g_task2' } });
  if (factory && taskGroup) return;
  if (DRY_RUN) throw new Error('ModuleNode 缺失（dry-run 无法自动补），请先执行 data-import/update-content-menu.js');
  console.log('ModuleNode 缺失，先执行 update-content-menu.js ...');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'update-content-menu.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) throw new Error('update-content-menu.js 执行失败');
}

async function ensureBrand() {
  const exist = await prisma.brand.findFirst({ where: { name: BRAND_NAME } });
  if (exist) {
    if (exist.id !== BRAND_ID) {
      throw new Error(`发现同名品牌但 id=${exist.id} ≠ ${BRAND_ID}，前端配置按 9 写死，请先人工核对`);
    }
    console.log(`brand ${BRAND_ID} 已存在: ${BRAND_NAME}`);
    return;
  }
  const idTaken = await prisma.brand.findUnique({ where: { id: BRAND_ID } });
  if (idTaken) throw new Error(`brandId ${BRAND_ID} 已被占用（${idTaken.name}），请改用其他 id`);
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!company) throw new Error('no company row found');
  if (!DRY_RUN) {
    await prisma.brand.create({ data: { id: BRAND_ID, name: BRAND_NAME, companyId: company.id, status: 1 } });
  }
  console.log(`brand ${BRAND_ID} 创建: ${BRAND_NAME}（companyId=${company.id}）`);
}

async function ensureAdminMembers() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  let created = 0;
  for (const u of admins) {
    const exist = await prisma.brandMember.findFirst({
      where: { brandId: BRAND_ID, userId: u.id, roleKey: 'ADMIN' },
    });
    if (exist) continue;
    if (!DRY_RUN) {
      await prisma.brandMember.create({ data: { brandId: BRAND_ID, userId: u.id, roleKey: 'ADMIN' } });
    }
    created += 1;
  }
  console.log(`BrandMember: ADMIN ${admins.length} 人，新建 ${created} 条`);
}

async function main() {
  console.log(`东风日产(brand ${BRAND_ID}) 工作区启用${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  // ── 1. ModuleNode（m_factory / m_kox_g_task2 菜单树）──────────────
  await ensureModuleNodes();

  // ── 2. Brand 行 + ADMIN BrandMember ─────────────────────────────
  await ensureBrand();
  await ensureAdminMembers();

  // ── 3. 算力池 ───────────────────────────────────────────────────
  if (!DRY_RUN) {
    await prisma.brandQuota.upsert({
      where: { brandId: BRAND_ID },
      create: { brandId: BRAND_ID, total: Number(process.env.BRAND_QUOTA_DEFAULT ?? 2000), used: 0 },
      update: {},
    });
  }
  console.log('算力池: 2000（已存在则不动）');

  // ── 4. 素材类型标签 ×4 ─────────────────────────────────────────
  for (const name of TYPE_TAGS) {
    const exist = await prisma.materialTypeTag.findFirst({ where: { brandId: BRAND_ID, name } });
    if (exist) continue;
    if (!DRY_RUN) await prisma.materialTypeTag.create({ data: { brandId: BRAND_ID, name } });
  }
  console.log(`素材类型标签: ${TYPE_TAGS.length} 个`);

  // ── 5. 产品树 ×6 车系（knowledge/salesPolicy/faq 初稿）───────────
  let prodNew = 0, prodSkip = 0;
  for (const p of PRODUCTS) {
    const exist = await prisma.product.findFirst({ where: { brandId: BRAND_ID, name: p.name, parentId: null } });
    if (exist) { prodSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.product.create({
        data: {
          brandId: BRAND_ID, name: p.name, displayName: p.name, configType: 'product',
          description: `${BRAND_SHORT}车系（初稿占位：公开资料整理，待官方资料替换）`,
          knowledge: p.knowledge, salesPolicy: p.salesPolicy, faq: p.faq,
        },
      });
    }
    prodNew += 1;
  }
  console.log(`产品树: 新建 ${prodNew} 个车系，已存在跳过 ${prodSkip} 个（共 ${PRODUCTS.length}）`);

  // ── 6. 创作策略 ×7（按 name 幂等）───────────────────────────────
  let stNew = 0, stSkip = 0;
  for (const s of STRATEGIES) {
    const exist = await prisma.writingStrategy.findFirst({ where: { brandId: BRAND_ID, name: s.name } });
    if (exist) { stSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.writingStrategy.create({
        data: {
          brandId: BRAND_ID, name: s.name, description: s.description,
          persona: s.persona, sellingPoints: s.sellingPoints,
          audience: s.audience, contentDirections: s.contentDirections,
          enabled: s.enabled, sort: s.sort,
        },
      });
    }
    stNew += 1;
  }
  console.log(`创作策略: 新建 ${stNew} 条，同名跳过 ${stSkip} 条（共 ${STRATEGIES.length}）`);

  // ── 7. 菜单授权：brand 9 全员追加 m_factory + m_kox_g_task2 子树 ──
  const factory = await prisma.moduleNode.findUnique({ where: { key: 'm_factory' } });
  const taskGroup = await prisma.moduleNode.findUnique({ where: { key: 'm_kox_g_task2' } });
  if (!factory || !taskGroup) throw new Error('ModuleNode 缺失：m_factory / m_kox_g_task2');
  const want = new Set([factory.id, taskGroup.id]);
  const collect = async (parentId) => {
    const kids = await prisma.moduleNode.findMany({ where: { parentId } });
    for (const k of kids) { want.add(k.id); await collect(k.id); }
  };
  await collect(factory.id);
  await collect(taskGroup.id);
  const members = await prisma.brandMember.findMany({ where: { brandId: BRAND_ID }, select: { userId: true } });
  let granted = 0;
  for (const m of members) {
    const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { id: true, moduleIds: true } });
    if (!u) continue;
    const missing = [...want].filter((id) => !u.moduleIds.includes(id));
    if (!missing.length) continue;
    granted += 1;
    if (!DRY_RUN) {
      await prisma.user.update({ where: { id: u.id }, data: { moduleIds: { push: missing } } });
    }
  }
  console.log(`菜单授权: brand ${BRAND_ID} 成员 ${members.length} 人，补授权 ${granted} 人（菜单节点 ${want.size} 个）`);

  console.log('素材图片: 跳过（日产素材客户未提供，到位后单独导入）');

  // ── 8. 品牌模板 ×4（模板体系初稿，按 kind+name 幂等）────────────
  let tpNew = 0, tpSkip = 0;
  for (const t of TEMPLATES) {
    const exist = await prisma.brandTemplate.findFirst({ where: { brandId: BRAND_ID, kind: t.kind, name: t.name } });
    if (exist) { tpSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.brandTemplate.create({
        data: { brandId: BRAND_ID, kind: t.kind, productId: null, name: t.name, summary: t.summary, content: t.content, status: 1, remark: t.remark },
      });
    }
    tpNew += 1;
  }
  console.log(`品牌模板: 新建 ${tpNew} 个，同名跳过 ${tpSkip} 个（共 ${TEMPLATES.length}）`);

  // ── 9. 合规红线规则 ×4（按 name 幂等）───────────────────────────
  let ruleNew = 0, ruleSkip = 0;
  for (const r of COMPLIANCE_RULES) {
    const exist = await prisma.knowledgeRule.findFirst({ where: { brandId: BRAND_ID, category: 'compliance', name: r.name } });
    if (exist) { ruleSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.knowledgeRule.create({
        data: { brandId: BRAND_ID, category: 'compliance', name: r.name, pattern: r.pattern, action: r.action, replyHint: r.replyHint || null, enabled: true },
      });
    }
    ruleNew += 1;
  }
  console.log(`合规规则: 新建 ${ruleNew} 条，同名跳过 ${ruleSkip} 条（共 ${COMPLIANCE_RULES.length}）`);

  console.log(DRY_RUN ? 'dry-run 完成，未写库' : '启用完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
