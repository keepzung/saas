#!/usr/bin/env node
// 服务器运行：《东风日产AI系统》文档内容归位到内容工厂（幂等，可重跑）
//   1. 产品资料库（核心亮点/颜值焕新/百万舒适/高阶智能/全车级品质/销售政策）→ Product.knowledge
//      （brand9 东风日产投标区 + brand10 演示区 的「东风日产N7」产品，brand9 缺则创建）
//   2. 内容创作策略 4 个人设（产品体验官/生活种草官/老车主销售/福利分享官）→ WritingStrategy
//      字段映射：策略描述→description｜人设→persona[]｜卖点→sellingPoints[]｜目标受众→audience[]｜内容方向→contentDirections[{name,description}]
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

const prisma = new PrismaClient();

const N7_KNOWLEDGE = `【核心亮点】
1. 舒适王牌再升级：作为日产的"沙发厂"代表作，N7 的 AI零压云毯座椅 是核心卖点。座椅内置多个传感器和气囊，能自适应调整支撑，高配车型还带通风、加热和按摩功能，后排也配备了通风加热，真正做到全家舒享。
2. 空间越级表现：车长近4米9，轴距达到2米915，提供了宽敞的后排空间和超大后备箱，无论是日常通勤还是全家出游都绰绰有余。
3. 智能配置拉满：高配车型搭载了 高通8295P芯片 和 15.6英寸2.5K大屏，车机操作流畅，语音交互反应快。新款还增加了带激光雷达的智驾版，支持城市 NOA 领航辅助，科技感满满。
4. 续航补能高效：提供510km和625km两种 CLTC 续航版本，搭载磷酸铁锂电池。支持快充，从10%充到80%最快仅需19分钟，日常使用非常便捷。

【颜值焕新】
极简美学基底，颜值质感焕新；全新车色-青柑：全新灵感色，一眼清新治愈；质感细节焕新：焕新五幅流汐轮毂、电容式双幅多功能方向盘、蓝牙钥匙5.0，每一处升级都为舒适用车而来；0.618黄金比例车姿：极简主义好看耐看。

【百万舒适】
宽适空间人人都舒展：4930mm车长、1492mm车高、1895mm车宽、2915mm轴距；真五座不将就：83%超大得房率、1022mm前排有效头部空间、707mm后排膝部空间、555mm后排过道宽度、305mm后排坐姿高度；超大一体式全景天幕：4㎡车内采光面积、99.9%紫外线阻隔率；环抱式座舱设计；256色光瀑式智能氛围灯；百万级大沙发座舱前后同享舒适（AI零压云毯座椅+后排舒适配置，久坐不累）。
前后三屏双控：5.6mm极窄边框、2.5K级高清分辨率、88.3%超高屏占比、95%NTSC广色域、2.5D微曲镜面屏（7H）、1000nits峰值亮度。
后排智控屏：后排座椅通风加热3档调节、全环境自适应亮度调节、后排空调（开关/温度）、7档风量调节、2个Type-C（27W快充）、儿童锁。
更聪明的NISSAN OS 2.0：高通8295P座舱芯片、全场景智能地图导航、无界UI平板式分屏交互、手车互联（HUAWEI HiCar/ICCOA/Carlink/Apple CarPlay）、智慧场景语音自定义、全面生态应用。
全家人的AI助手小尼：双AI大模型（科大讯飞星火+DeepSeek-R1）、OMS智能感知多乘员面容识别、400ms超快语音响应（首字上屏600ms）、四音区拾音精准识别（普通话/粤语/四川话）、8大高频儿童功能。
全域智能防晕车技术：16项对策全面防晕车、8大功能控制防晕、15参数联调舒适刹停性能升级。
大师级音响系统：18个扬声器（新增4个天空扬声器）、7.1.4声道布局支持杜比全景声、1500W大功率功放超重低音炮、前排双升降扬声器、双通道头枕音响、科大讯飞AI调音。

【高阶智能】
超靠谱 全家出行都敢开：搭载 Momenta R6 强化学习大模型（将升级 R7 世界模型）；全场景厘米级感知，城市/乡村/山路/园区内部道路都能用；不晕车：东风日产×Momenta 深度共创，专为中国家庭定制防晕车驾驶辅助调校。
激光雷达：无惧视线影响，逆光、雨雾更安全；200m最大探测距离；ROI全局可调（广角模式/远焦模式自动切换）；超大25°垂直视场角；"智能凝视"功能：垂直视角收窄至8°，分辨率提升一倍。
29个高感知传感器360°全方位无死角感知，消除全向盲区；高通骁龙8650P 驾驶辅助芯片，200TOPS最高稀疏算力。
城市领航辅助NOA：覆盖城区园区，实现车位到车位的领航驾驶辅助；高速领航辅助NOA：覆盖高速高架；智能泊车辅助系统：复杂场景轻松泊入；22项主动安全功能。

【全车级品质】
用料更可靠：母婴级标准打造，严格的VOC标准管控；超安全电池系统：78年纯电技术底蕴、29年电池研发制造经验；高刚性笼式车身：2000MPa超高强A柱、1700MPa辊压横梁。

【销售政策】
限时权益价：10.99万-14.69万；2年6万0息，置换至高享17000元补贴，叠加智行无忧保障+三无忧服务。
车型价格：510 Air 10.99万｜510 Pro 11.99万｜625 Pro 12.99万｜510 Max 12.99万｜625 Max 13.99万｜625 Pro 骑士版 13.49万｜625 Max 骑士版 14.49万。
置换补贴：本品置换（原有日产车置换N7）厂家补贴5000元；他品牌置换厂家补贴3000元；可叠加国家置换补贴至高12000元，置换综合至高17000元（各地国家补贴落地细则有差异）；骑士版同期：本品置换厂家补贴2000元，叠加国家补贴至高12000元。
金融方案（官方3套可选）：方案1：2年6万定额0息；方案2：0首付起，1–5年期低息；方案3：20%首付起5年期「轻享还」，月供更友好。
官方服务权益：三电终身质保+终身自燃全额包赔（双终身保障礼）；「三无忧服务」：窗、杠、漆、电相关用车保障；下定膨胀礼：3000元定金抵5000元（阶段性限时）；推荐礼：老客户推荐成交单台可获1000元积分；Max/Pro早期用户限时权益包：副驾零压座椅、车载冰箱、头枕音响等选装包（限时）。
备注：政策为阶段性活动，以当地专营店当期执行口径为准。`;

const STRATEGIES = [
  {
    name: '产品体验官',
    description: '共情型汽车体验销售人设，站在女生选车视角讲给看重外观内饰、乘坐质感的精致女生群体，重点分享东风日产车型试驾感受，拆解大沙发座椅、座舱氛围、智驾辅助这些直观可感知的体验细节',
    persona: ['共情型汽车体验博主｜懂女生选车，专注真实试驾感受'],
    sellingPoints: ['日产零压大沙发座椅，久坐不累', '底盘调校柔和，滤震舒适', '座舱静谧性优秀', '智能辅助驾驶，降低开车压力'],
    audience: ['注重乘坐感受的购车群体', '看重舒适性的家庭购车决策者'],
    contentDirections: [{ name: '试驾体验种草', description: '以真实试驾感受分享舒适卖点，种草后引导私信约试驾' }],
  },
  {
    name: '生活种草官',
    description: '热爱出行的生活化销售人设，讲给喜欢周末露营、近郊遛娃的三口之家，结合东风日产车型装载能力、舒适底盘、外放电等配置，描绘全家出游松弛场景，凸显家用出行幸福感',
    persona: ['热爱自驾的生活博主｜擅长挖掘家用车的出行乐趣'],
    sellingPoints: ['后备箱空间充裕，婴儿车/露营装备轻松收纳', '底盘舒适，孩子坐车不容易晕车', '支持外放电，露营更方便', '整车乘坐空间宽敞，老人小孩都舒展'],
    audience: ['喜欢近郊出游的三口之家', '追求松弛感的家庭用户'],
    contentDirections: [{ name: '家庭场景种草', description: '结合露营、遛娃出行场景分享用车，种草后引导私信了解车型' }],
  },
  {
    name: '老车主销售',
    description: '资深日产老车主出身销售，用多年真实用车经验讲给日常通勤的都市白领，分享东风日产车型长期代步的能耗、静谧表现，聊聊油/电车型融入城市通勤的省心用车体验',
    persona: ['日产老车主销售｜开过多年日产，懂长期用车的真实痛点'],
    sellingPoints: ['油耗/电耗表现友好，日常代步省钱', '整车品控稳定，小毛病少', '售后网点多，维保省心', '座舱安静，通勤路上很治愈'],
    audience: ['朝九晚五的通勤白领', '追求用车省心、低养护成本用户'],
    contentDirections: [{ name: '真实用车分享', description: '老车主视角聊长期代步感受，种草后引导私信咨询车型' }],
  },
  {
    name: '福利分享官',
    description: '门店福利分享者，给打算换车购车的年轻家庭算一笔明白账，拆解东风日产全系置换补贴、金融方案、限时购车权益，教大家怎么组合福利入手最划算',
    persona: ['实在的门店福利分享官｜不玩套路，帮客户算清购车成本'],
    sellingPoints: ['旧车置换有专项补贴', '灵活金融分期方案，月供压力可控', '到店试驾专属礼', '限时购车权益不定期更新'],
    audience: ['计划增换购的年轻家庭', '关心购车预算、福利政策的意向客户'],
    contentDirections: [{ name: '购车政策科普', description: '清晰拆解购车福利方案，讲解后引导私信测算落地价' }],
  },
];

async function main() {
  if (!/\/saas_prod(\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 未指向 saas_prod——本脚本仅应在服务器上对 saas_prod 执行');
  }
  for (const brandId of [9, 10]) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) { console.log(`brand ${brandId} 不存在，跳过`); continue; }
    console.log(`\n== brand ${brandId} ${brand.name} ==`);

    // 产品知识
    let product = await prisma.product.findFirst({ where: { brandId, name: '东风日产N7' } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          brandId,
          name: '东风日产N7',
          displayName: '日产N7',
          description: '东风日产 N7 纯电轿车——合资纯电家轿标杆',
          knowledge: N7_KNOWLEDGE,
          configType: 'product',
        },
      });
      console.log(`  Product 东风日产N7 已创建（brand ${brandId} 缺失）`);
    } else {
      await prisma.product.update({ where: { id: product.id }, data: { knowledge: N7_KNOWLEDGE, displayName: product.displayName ?? '日产N7' } });
      console.log(`  Product 东风日产N7 #${product.id} knowledge 已更新为官方资料库全文（${N7_KNOWLEDGE.length} 字）`);
    }

    // 内容创作策略
    for (const s of STRATEGIES) {
      const dup = await prisma.writingStrategy.findFirst({ where: { brandId, name: s.name } });
      if (!dup) {
        await prisma.writingStrategy.create({
          data: {
            brandId, productId: product.id, name: s.name, description: s.description,
            persona: s.persona, sellingPoints: s.sellingPoints, audience: s.audience,
            contentDirections: s.contentDirections, enabled: true, sort: STRATEGIES.indexOf(s),
          },
        });
        console.log(`  WritingStrategy ${s.name} 已创建`);
      } else {
        await prisma.writingStrategy.update({
          where: { id: dup.id },
          data: {
            productId: product.id, description: s.description, persona: s.persona,
            sellingPoints: s.sellingPoints, audience: s.audience, contentDirections: s.contentDirections,
          },
        });
        console.log(`  WritingStrategy ${s.name} #${dup.id} 已更新`);
      }
    }
  }
  console.log('\n完成：《东风日产AI系统》内容已归位（产品知识→Product.knowledge，4策略→WritingStrategy）');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
