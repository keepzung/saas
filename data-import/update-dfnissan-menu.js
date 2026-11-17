// 东风日产建设项菜单同步（幂等）：
// 1) 内容工厂Pro 增页：模板库/知识库规则/案例库（资料&策略组）+ 运营报表（工作台组）
// 2) 「智能私信」分类（私信工作台/智能私信设置/SLA 看板）——所有工作区默认隐藏，brand9 接入后来鼓后放开
// 用法: node update-dfnissan-menu.js
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

const FACTORY_ADDITIONS = [
  {
    groupKey: 'm_factory_g0',
    features: [{ name: '运营报表', path: '/content-pro/reports' }],
  },
  {
    groupKey: 'm_factory_g1',
    features: [
      { name: '模板库', path: '/content-pro/config/templates' },
      { name: '知识库规则', path: '/content-pro/config/rules' },
      { name: '案例库', path: '/content-pro/config/cases' },
    ],
  },
];

const DM_CATEGORY = {
  key: 'm_dm',
  name: '智能私信',
  groups: [
    {
      key: 'm_dm_g0',
      name: '私信运营',
      features: [
        // 私信工作台复用来鼓线索页（品牌通用，brand9 放开线索中心）
        { name: '私信工作台', path: '/laigu/leads' },
        { name: '智能私信设置', path: '/dm/settings' },
        { name: 'SLA 看板', path: '/dm/sla' },
      ],
    },
  ],
};

/** 历史修正：/dm/workspace 占位节点（2026-11-17 建）迁到 /laigu/leads，不另建新节点 */
async function migrateWorkspaceFeature(prisma, groupId) {
  const old = await prisma.moduleNode.findFirst({
    where: { parentId: groupId, path: '/dm/workspace' },
  });
  if (!old) return;
  const dupe = await prisma.moduleNode.findFirst({
    where: { parentId: groupId, path: '/laigu/leads' },
  });
  if (dupe) {
    await prisma.moduleNode.delete({ where: { id: old.id } });
    console.log('removed legacy feature: /dm/workspace（已有 /laigu/leads）');
    return;
  }
  await prisma.moduleNode.update({
    where: { id: old.id },
    data: { key: 'm_dm_g0_f_leads', path: '/laigu/leads', name: '私信工作台' },
  });
  console.log('migrated feature: /dm/workspace -> /laigu/leads');
}

async function upsertFeature(prisma, groupId, groupKey, f, sort) {
  const key = `${groupKey}_f_${f.path.split('/').pop().replace(/[^a-z0-9]/gi, '_')}`;
  let existing = await prisma.moduleNode.findFirst({
    where: { parentId: groupId, type: 'feature', path: f.path },
  });
  if (!existing) {
    existing = await prisma.moduleNode.findUnique({ where: { key } }).catch(() => null);
  }
  if (existing) {
    if (existing.name !== f.name) {
      await prisma.moduleNode.update({ where: { id: existing.id }, data: { name: f.name, sort } });
      console.log(`updated feature: ${f.name} -> ${f.path}`);
    } else {
      console.log(`feature ok: ${f.name}`);
    }
    return;
  }
  await prisma.moduleNode.create({
    data: { key, name: f.name, type: 'feature', path: f.path, parentId: groupId, sort },
  });
  console.log(`created feature: ${f.name} -> ${f.path}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1) 内容工厂Pro 增页（按组 key 定位，feature 按 path 幂等）
    for (const spec of FACTORY_ADDITIONS) {
      const group = await prisma.moduleNode.findUnique({ where: { key: spec.groupKey } });
      if (!group) throw new Error(`group ${spec.groupKey} not found（先跑 update-content-menu.js）`);
      const maxSort = await prisma.moduleNode.aggregate({ where: { parentId: group.id }, _max: { sort: true } });
      let sort = (maxSort._max.sort ?? -1) + 1;
      for (const f of spec.features) {
        await upsertFeature(prisma, group.id, group.key, f, sort);
        sort += 1;
      }
    }

    // 2) 智能私信分类（顶层 category，全工作区默认隐藏——brands.js 已配）
    let dm = await prisma.moduleNode.findUnique({ where: { key: DM_CATEGORY.key } });
    if (!dm) {
      const maxSort = await prisma.moduleNode.aggregate({ where: { parentId: null }, _max: { sort: true } });
      dm = await prisma.moduleNode.create({
        data: { key: DM_CATEGORY.key, name: DM_CATEGORY.name, type: 'category', parentId: null, sort: (maxSort._max.sort ?? 0) + 1 },
      });
      console.log('created category: 智能私信');
    }
    for (const g of DM_CATEGORY.groups) {
      let group = await prisma.moduleNode.findFirst({ where: { parentId: dm.id, type: 'group', name: g.name } });
      if (!group) {
        group = await prisma.moduleNode.findUnique({ where: { key: g.key } }).catch(() => null);
      }
      if (!group) {
        group = await prisma.moduleNode.create({
          data: { key: g.key, name: g.name, type: 'group', parentId: dm.id, sort: 0 },
        });
        console.log(`created group: ${g.name}`);
      }
      await migrateWorkspaceFeature(prisma, group.id);
      let sort = 0;
      for (const f of g.features) {
        await upsertFeature(prisma, group.id, group.key, f, sort);
        sort += 1;
      }
    }

    const total = await prisma.moduleNode.count();
    console.log('moduleNode total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('update-dfnissan-menu failed:', e.message || e);
  process.exit(1);
});
