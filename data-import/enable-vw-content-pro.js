#!/usr/bin/env node
// 大众(brandId=4) 内容工厂Pro + 内容创作任务 启用（幂等，可重跑）
// 数据源：tools/crawl-marketine/dumps/855（上汽大众 855 公司旧系统实爬）
//         tools/crawl-marketine/materials-backup/855/（242 张原图，文件名 <素材id>_<hash>_<原始名>.jpg）
// 范围：ModuleNode 确保 → BrandQuota 2000 → 素材类型标签×4 → 产品树×5 车系
//       → 创作策略×7（大众版初稿，运营后台可改）→ BrandMember moduleIds 追加
//       → 素材图片（物理文件拷贝 + MaterialImage 入库，typeId 按 type_tag、productId 按车系）
// 明确不做：859（华帝 vatti）素材一律不导；不写其他品牌任何数据
// 用法: node enable-vw-content-pro.js [--dry-run] [--skip-images]
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
const SKIP_IMAGES = process.argv.includes('--skip-images');
const BRAND_ID = 4;

const DUMP_DIR = path.join(ROOT, 'tools', 'crawl-marketine', 'dumps', '855');
const SRC_IMG_DIR = path.join(ROOT, 'tools', 'crawl-marketine', 'materials-backup', '855');
const DEST_IMG_DIR = process.env.UPLOAD_ROOT
  ? path.join(process.env.UPLOAD_ROOT, 'materials', String(BRAND_ID))
  : path.join(ROOT, 'backend', 'uploads', 'materials', String(BRAND_ID));

// 旧系统 type_tag → 标签名（dumps/855/aigc-extras.json 实爬：9/10/11/28）
const TYPE_TAGS = [
  { oldId: 9, name: '整车外观' },
  { oldId: 10, name: '前排内饰' },
  { oldId: 11, name: '用车场景' },
  { oldId: 28, name: '默认占位引导' },
];

// 旧系统 product_id → 车系（按素材原图文件名/车牌推断，2026-10-28 已确认）
const PRODUCTS = [
  { oldId: 492, name: 'ID. ERA 9X' },
  { oldId: 478, name: '帕萨特 Pro' },
  { oldId: 473, name: '朗逸 Pro' },
  { oldId: 468, name: '途观L Pro' },
  { oldId: 481, name: '途昂 PRO' },
];

// 创作策略×7（参照东风 DF_STRATEGIES 结构的大众版初稿；前 5 启用、后 2 备用）
const VW_STRATEGIES = [
  {
    name: '从业多年的大众老销售',
    description: '老销售用从业多年的经验，给正在纠结下手的家用换车客户算一笔账，重点讲这台车的空间、油耗和保有量优势，把账算明白。',
    persona: ['从业多年的大众老销售，见过各种纠结换车时机的客户，说话接地气爱算账'],
    sellingPoints: ['德系品质，保有量大，保值省心', '空间 practical 后排坐三个大人不挤，家用正好', '油耗表现稳定，通勤成本可控', '门店置换补贴直接抵车款，手续省心'],
    audience: ['正在纠结换车时机的家用换车客户', '看重保有量和保值率的务实买家'],
    contentDirections: [{ name: '购车算账', description: '老销售借具体场景讲清卖点，自然引导私信留资' }],
    enabled: true, sort: 1,
  },
  {
    name: '直爽00后大众销售',
    description: '00后销售不绕弯子，讲给第一次买车的年轻买家，重点讲入门价格、配置实用性和用车成本，直接给结论。',
    persona: ['直爽的00后大众销售，不绕弯子，一张嘴就是数字和结论'],
    sellingPoints: ['入门价格实在，首购预算压力小', '标配实用，不给必用功能加价', '保养便宜网点多，异地用车也不慌', '二手残值稳，开几年换车不亏'],
    audience: ['第一次买车的年轻买家', '预算有限但想要合资品质的上班族'],
    contentDirections: [{ name: '首购种草', description: '用直接给结论的方式讲清性价比，引导私信问价' }],
    enabled: true, sort: 2,
  },
  {
    name: '专注SUV的家庭派',
    description: '家庭用车体验党讲给多口之家，重点突出途观L/途昂的空间、舒适和安全，结合全家出行的真实场景。',
    persona: ['专注SUV多年的销售', '自己也是家庭用车用户，懂带娃出行的痛点'],
    sellingPoints: ['大五座/七座灵活布局，二孩家庭全家出行不挤', '后备箱装得下婴儿车+行李+露营装备', '底盘稳长途不累，老人小孩坐得舒服', '安全配置齐全，全家出行放心'],
    audience: ['多口之家换车用户', '注重空间的二胎家庭', '经常全家自驾游的用户'],
    contentDirections: [{ name: '家庭场景种草', description: '从家庭用车场景切入，突出空间与舒适，引导到店试驾' }],
    enabled: true, sort: 3,
  },
  {
    name: '颜值种草的大众女销售',
    description: '高颜值共情型女销售，用女生视角讲给注重外观内饰的购车群体，重点讲车身颜色、内饰氛围和大屏这些看得见摸得着的细节。',
    persona: ['高颜值共情型汽车女销售', '审美在线，懂女生买车时在意的每一个细节'],
    sellingPoints: ['大漠金/天境蓝/仙踪绿等多款车身颜色，怎么拍都出片', '内饰氛围感拉满，双拼色可选', '大尺寸联屏，科技感与颜值兼备', '大灯造型辨识度高，晚上点亮很好看'],
    audience: ['注重外观内饰的女性购车群体', '家庭购车决策中的审美担当'],
    contentDirections: [{ name: '颜值种草', description: '用女生视角讲颜值细节，种草后引导私信看车' }],
    enabled: true, sort: 4,
  },
  {
    name: '资深门店店长',
    description: '福利分享官用算账的方式，讲给第一次买这台车的用户，重点算落地价、置换政策和用车成本，说明这车买得值。',
    persona: ['资深门店店长，福利分享官，最会帮第一次买车的用户算总账'],
    sellingPoints: ['现金优惠+置换补贴一起算，落地省多少一目了然', '金融方案灵活，月供压力小', '保险上牌一条龙，提车不折腾', '首任车主权益清单帮你列全'],
    audience: ['第一次买这台车的用户', '手上有旧车考虑置换的用户'],
    contentDirections: [{ name: '购车算账', description: '店长帮用户算总账，讲清买得值，引导留资' }],
    enabled: true, sort: 5,
  },
  {
    name: '智能座舱体验官',
    description: '门店运营人员用演示和讲解的方式，讲给科技尝鲜型用户，重点讲大屏互联、智能语音和辅助驾驶的日常体验。',
    persona: ['门店运营人员，智能座舱功能演示担当'],
    sellingPoints: ['大尺寸中控屏+全液晶仪表，信息一眼读完', '智能语音助手，导航音乐免下手', '手机互联投屏，上车即延续习惯', 'L2 级辅助驾驶，高速通勤更轻松'],
    audience: ['科技尝鲜型用户', '对智能座舱感兴趣的年轻家庭'],
    contentDirections: [{ name: '座舱演示', description: '用演示和讲解方式展示智能座舱，引导到店体验' }],
    enabled: false, sort: 6,
  },
  {
    name: '商务接待面子舒适都要',
    description: '家庭出行规划师讲给商务接待用车者，重点讲豪华内饰、静谧座舱和乘坐体验，体现商务形象。',
    persona: ['家庭出行规划师，懂商务接待的门面与里子'],
    sellingPoints: ['稳重大气的外观，接待客户有面子', '静谧座舱+舒适悬架，客户坐得舒服谈得顺畅', '后排体验讲究，长途接待不怠慢', '油耗与保养成本可控，公司用车账好算'],
    audience: ['商务接待用车者', '企业主/个体老板'],
    contentDirections: [{ name: '商务场景', description: '从商务接待场景讲豪华与舒适，引导到店品鉴' }],
    enabled: false, sort: 7,
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

async function main() {
  console.log(`大众(brand ${BRAND_ID}) 内容工厂启用${DRY_RUN ? '（dry-run，不写库）' : ''}${SKIP_IMAGES ? '（跳过素材导入）' : ''}`);

  // ── 1. ModuleNode（m_factory / m_kox_g_task2 菜单树）──────────────
  await ensureModuleNodes();

  // ── 2. 算力池（quota.service ensureBrand 同默认）──────────────────
  if (!DRY_RUN) {
    await prisma.brandQuota.upsert({
      where: { brandId: BRAND_ID },
      create: { brandId: BRAND_ID, total: Number(process.env.BRAND_QUOTA_DEFAULT ?? 2000), used: 0 },
      update: {},
    });
  }
  console.log('算力池: 2000（已存在则不动）');

  // ── 3. 素材类型标签 ×4 ───────────────────────────────────────────
  const tagMap = new Map(); // old type_tag id → new MaterialTypeTag id
  for (const t of TYPE_TAGS) {
    const exist = await prisma.materialTypeTag.findFirst({ where: { brandId: BRAND_ID, name: t.name } });
    if (exist) { tagMap.set(t.oldId, exist.id); continue; }
    if (!DRY_RUN) {
      const created = await prisma.materialTypeTag.create({ data: { brandId: BRAND_ID, name: t.name } });
      tagMap.set(t.oldId, created.id);
    } else {
      tagMap.set(t.oldId, -tagMap.size - 1);
    }
  }
  console.log(`素材类型标签: ${TYPE_TAGS.length} 个`);

  // ── 4. 产品树 ×5 车系（单层，configType=product 供生成选择）────────
  const prodMap = new Map(); // old product_id → new Product id
  for (const p of PRODUCTS) {
    const exist = await prisma.product.findFirst({ where: { brandId: BRAND_ID, name: p.name, parentId: null } });
    if (exist) { prodMap.set(p.oldId, exist.id); continue; }
    if (!DRY_RUN) {
      const created = await prisma.product.create({
        data: { brandId: BRAND_ID, name: p.name, displayName: p.name, configType: 'product' },
      });
      prodMap.set(p.oldId, created.id);
    } else {
      prodMap.set(p.oldId, -prodMap.size - 1);
    }
  }
  console.log(`产品树: ${PRODUCTS.length} 个车系`);

  // ── 5. 创作策略 ×7（按 name 幂等）────────────────────────────────
  let stNew = 0, stSkip = 0;
  for (const s of VW_STRATEGIES) {
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
  console.log(`创作策略: 新建 ${stNew} 条，同名跳过 ${stSkip} 条（共 ${VW_STRATEGIES.length}）`);

  // ── 6. 菜单授权：brand 4 全员追加 m_factory + m_kox_g_task2 子树 ──
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

  // ── 7. 素材图片（仅 855 大众，242 张；859 华帝不导）────────────────
  if (!SKIP_IMAGES) {
    const materials = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, 'aigc-materials.json'), 'utf8'));
    const rows = materials.list ?? [];
    const srcFiles = fs.existsSync(SRC_IMG_DIR) ? fs.readdirSync(SRC_IMG_DIR) : [];
    const seenIds = new Set();
    let copied = 0, dbNew = 0, dbSkip = 0, missing = 0;
    for (const row of rows) {
      if (seenIds.has(row.id)) continue; // dump 分页重复（途观L组 10 条）
      seenIds.add(row.id);
      const prefix = String(row.id);
      const fname = srcFiles.find((f) => f.startsWith(`${prefix}_`));
      if (!fname) { missing += 1; continue; }
      const destPath = path.join(DEST_IMG_DIR, fname);
      const url = `/uploads/materials/${BRAND_ID}/${fname}`;
      // name 取原始文件名（文件名三段式 <素材id>_<hash>_<原始名>，去掉前两段）
      const name = fname.split('_').slice(2).join('_').slice(0, 80) || fname.slice(0, 80);
      if (!DRY_RUN) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(DEST_IMG_DIR, { recursive: true });
          fs.copyFileSync(path.join(SRC_IMG_DIR, fname), destPath);
          copied += 1;
        }
        const dup = await prisma.materialImage.findFirst({ where: { brandId: BRAND_ID, url } });
        if (dup) { dbSkip += 1; continue; }
        await prisma.materialImage.create({
          data: {
            brandId: BRAND_ID,
            url,
            name,
            typeId: tagMap.get(row.type_tag) ?? null,
            productNodeId: prodMap.get(row.product_id) ?? null,
          },
        });
        dbNew += 1;
      } else {
        dbNew += 1;
        if (!fs.existsSync(destPath)) copied += 1;
      }
    }
    console.log(`素材图片: 入库 ${dbNew} 张，已存在跳过 ${dbSkip} 张，物理文件新拷 ${copied} 个，备份缺失 ${missing} 张（dump 唯一 ${seenIds.size}）`);
  }

  console.log(DRY_RUN ? 'dry-run 完成，未写库' : '启用完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
