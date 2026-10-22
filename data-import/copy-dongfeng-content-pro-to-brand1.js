#!/usr/bin/env node
// 东风奕境(brandId=7) 内容工厂起步数据 → marketineok(brandId=1)（幂等，可重跑）
// 复制范围（与"功能和页面与东风一致"配套的起步数据）：
//   - 素材类型标签 / 素材套图 / 素材图片（AI 配图池）
//   - 产品三级树（brand→series→product，含 knowledge/salesPolicy/faq/封面）
//   - 创作策略（WritingStrategy，persona/卖点/受众/内容方向）
// 不复制：生成历史 XhsHistory、内容包、内容创作任务（业务产出数据不跨工作区）
// 附带：给 brand 1 全部成员的 moduleIds 追加 内容工厂Pro(m_factory) + 内容创作任务(m_kox_g_task2) 菜单权限
// 用法: node copy-dongfeng-content-pro-to-brand1.js [--dry-run] [--from 7] [--to 1]
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

const DRY_RUN = process.argv.includes('--dry-run');
const argOf = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const FROM = argOf('--from', 7);
const TO = argOf('--to', 1);

const prisma = new PrismaClient();

/** 子节点按 (mappedParentId, name) 幂等创建，返回 oldId→newId 映射 */
async function cloneTagTree(rows) {
  const idMap = new Map();
  // 旧数据根节点的 parentId 可能是 null、0 或指向本集之外的 id，一律视为根
  const ids = new Set(rows.map((r) => r.id));
  const isRoot = (r) => r.parentId == null || r.parentId === 0 || !ids.has(r.parentId);
  const roots = rows.filter(isRoot);
  const children = rows.filter((r) => !isRoot(r));
  for (const r of roots) {
    const exist = await prisma.materialTypeTag.findFirst({ where: { brandId: TO, parentId: null, name: r.name } });
    if (exist) { idMap.set(r.id, exist.id); continue; }
    if (DRY_RUN) { idMap.set(r.id, -idMap.size - 1); continue; }
    const created = await prisma.materialTypeTag.create({
      data: { brandId: TO, name: r.name, perSetting: r.perSetting ?? undefined },
    });
    idMap.set(r.id, created.id);
  }
  for (const r of children) {
    const parentId = idMap.get(r.parentId);
    if (!parentId) continue;
    const exist = await prisma.materialTypeTag.findFirst({ where: { brandId: TO, parentId, name: r.name } });
    if (exist) { idMap.set(r.id, exist.id); continue; }
    if (DRY_RUN) { idMap.set(r.id, -idMap.size - 1); continue; }
    const created = await prisma.materialTypeTag.create({
      data: { brandId: TO, name: r.name, parentId, perSetting: r.perSetting ?? undefined },
    });
    idMap.set(r.id, created.id);
  }
  return idMap;
}

async function main() {
  console.log(`复制内容工厂起步数据: brand ${FROM} → brand ${TO}${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  // ── 1. 素材类型标签 ──────────────────────────────────────────────
  const tags = await prisma.materialTypeTag.findMany({ where: { brandId: FROM } });
  const tagMap = await cloneTagTree(tags);
  console.log(`素材类型标签: ${tags.length} 个`);

  // ── 2. 素材套图 ─────────────────────────────────────────────────
  const sets = await prisma.materialImageSet.findMany({ where: { brandId: FROM } });
  const setIdMap = new Map();
  for (const s of sets) {
    const exist = await prisma.materialImageSet.findFirst({ where: { brandId: TO, name: s.name } });
    if (exist) { setIdMap.set(s.id, exist.id); continue; }
    if (DRY_RUN) { setIdMap.set(s.id, -setIdMap.size - 1); continue; }
    const created = await prisma.materialImageSet.create({ data: { brandId: TO, name: s.name } });
    setIdMap.set(s.id, created.id);
  }
  console.log(`素材套图: ${sets.length} 套`);

  // ── 3. 产品三级树 ───────────────────────────────────────────────
  const products = await prisma.product.findMany({ where: { brandId: FROM }, orderBy: { id: 'asc' } });
  const prodMap = new Map();
  const byParent = (pid) => products.filter((p) => p.parentId === pid);
  const cloneLevel = async (pid) => {
    for (const p of byParent(pid)) {
      const parentNew = pid == null ? null : prodMap.get(pid) ?? null;
      const exist = await prisma.product.findFirst({
        where: { brandId: TO, configType: p.configType, name: p.name, parentId: parentNew },
      });
      if (exist) { prodMap.set(p.id, exist.id); }
      else if (DRY_RUN) { prodMap.set(p.id, -prodMap.size - 1); }
      else {
        const created = await prisma.product.create({
          data: {
            brandId: TO, parentId: parentNew, name: p.name, displayName: p.displayName,
            configType: p.configType, description: p.description, knowledge: p.knowledge,
            salesPolicy: p.salesPolicy, faq: p.faq, coverUrl: p.coverUrl, sort: p.sort,
          },
        });
        prodMap.set(p.id, created.id);
      }
      await cloneLevel(p.id);
    }
  };
  await cloneLevel(null);
  console.log(`产品树: ${products.length} 个节点`);

  // ── 4. 素材图片（AI 配图池，按 url 幂等）──────────────────────────
  const images = await prisma.materialImage.findMany({ where: { brandId: FROM } });
  const toUrls = new Set((await prisma.materialImage.findMany({ where: { brandId: TO }, select: { url: true } })).map((r) => r.url));
  let imgNew = 0, imgSkip = 0;
  for (const im of images) {
    if (toUrls.has(im.url)) { imgSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.materialImage.create({
        data: {
          brandId: TO, url: im.url,
          setId: im.setId != null ? setIdMap.get(im.setId) ?? null : null,
          typeId: im.typeId != null ? tagMap.get(im.typeId) ?? null : null,
          productNodeId: im.productNodeId != null ? prodMap.get(im.productNodeId) ?? null : null,
        },
      });
    }
    imgNew += 1;
  }
  console.log(`素材图片: 新建 ${imgNew} 张，url 已存在跳过 ${imgSkip} 张（源共 ${images.length}）`);

  // ── 5. 创作策略（按 name 幂等）──────────────────────────────────
  const strategies = await prisma.writingStrategy.findMany({ where: { brandId: FROM }, orderBy: { sort: 'asc' } });
  let stNew = 0, stSkip = 0;
  for (const s of strategies) {
    const exist = await prisma.writingStrategy.findFirst({ where: { brandId: TO, name: s.name } });
    if (exist) { stSkip += 1; continue; }
    if (!DRY_RUN) {
      await prisma.writingStrategy.create({
        data: {
          brandId: TO, name: s.name, description: s.description,
          persona: s.persona ?? undefined, sellingPoints: s.sellingPoints ?? undefined,
          audience: s.audience ?? undefined, contentDirections: s.contentDirections ?? undefined,
          enabled: s.enabled, sort: s.sort,
          productId: s.productId != null ? prodMap.get(s.productId) ?? null : null,
        },
      });
    }
    stNew += 1;
  }
  console.log(`创作策略: 新建 ${stNew} 条，同名跳过 ${stSkip} 条（源共 ${strategies.length}）`);

  // ── 6. 算力池兜底（quota.service ensureBrand 同默认）───────────────
  if (!DRY_RUN) {
    await prisma.brandQuota.upsert({
      where: { brandId: TO },
      create: { brandId: TO, total: Number(process.env.BRAND_QUOTA_DEFAULT ?? 2000), used: 0 },
      update: {},
    });
  }

  // ── 7. 菜单授权：brand TO 全员追加 内容工厂Pro + 内容创作任务 ─────
  const factory = await prisma.moduleNode.findUnique({ where: { key: 'm_factory' } });
  const taskGroup = await prisma.moduleNode.findUnique({ where: { key: 'm_kox_g_task2' } });
  if (!factory || !taskGroup) throw new Error('ModuleNode 缺失：请先在服务器执行 data-import/update-content-menu.js');
  const want = new Set([factory.id, taskGroup.id]);
  const collect = async (parentId) => {
    const kids = await prisma.moduleNode.findMany({ where: { parentId } });
    for (const k of kids) { want.add(k.id); await collect(k.id); }
  };
  await collect(factory.id);
  await collect(taskGroup.id);
  const members = await prisma.brandMember.findMany({ where: { brandId: TO }, select: { userId: true } });
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
  console.log(`菜单授权: brand ${TO} 成员 ${members.length} 人，补授权 ${granted} 人（菜单节点 ${want.size} 个）`);

  console.log(DRY_RUN ? 'dry-run 完成，未写库' : '复制完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
