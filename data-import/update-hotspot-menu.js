// 灵感引擎（m_hotspot 分类）菜单同步（幂等）
// 用法: node update-hotspot-menu.js   （生产执行一次后，按需给用户分配 feature 的 moduleIds）
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

const CATEGORY = {
  key: 'm_hotspot',
  name: '灵感引擎',
  groups: [
    {
      key: 'm_hotspot_g0',
      name: '热点洞察',
      features: [
        { name: '热点雷达', path: '/hotspot/radar' },
        { name: '竞品分析', path: '/hotspot/competitors' },
      ],
    },
    {
      key: 'm_hotspot_g1',
      name: '智能创作',
      features: [
        { name: '爆款拆解', path: '/hotspot/breakdown' },
        { name: '视频工坊', path: '/hotspot/studio' },
      ],
    },
    {
      key: 'm_hotspot_g2',
      name: '达人合作',
      features: [
        { name: '达人匹配', path: '/hotspot/match' },
      ],
    },
  ],
};

async function upsertGroup(prisma, categoryId, spec) {
  let group = await prisma.moduleNode.findFirst({
    where: { parentId: categoryId, type: 'group', name: spec.name },
  });
  if (!group) {
    group = await prisma.moduleNode.findUnique({ where: { key: spec.key } }).catch(() => null);
  }
  if (!group) {
    group = await prisma.moduleNode.create({
      data: { key: spec.key, name: spec.name, type: 'group', parentId: categoryId, sort: 99 },
    });
    console.log(`created group: ${spec.name}`);
  }
  let sort = 0;
  for (const f of spec.features) {
    const key = `${group.key}_f_${f.path.split('/').pop().replace(/[^a-z0-9]/gi, '_')}`;
    let existing = await prisma.moduleNode.findFirst({
      where: { parentId: group.id, type: 'feature', path: f.path },
    });
    if (!existing) {
      existing = await prisma.moduleNode.findUnique({ where: { key } }).catch(() => null);
    }
    if (existing) {
      if (existing.name !== f.name || existing.path !== f.path || existing.sort !== sort) {
        await prisma.moduleNode.update({
          where: { id: existing.id },
          data: { name: f.name, path: f.path, sort },
        });
        console.log(`updated feature: ${f.name} -> ${f.path}`);
      } else {
        console.log(`feature ok: ${f.name}`);
      }
    } else {
      await prisma.moduleNode.create({
        data: { key, name: f.name, type: 'feature', path: f.path, parentId: group.id, sort },
      });
      console.log(`created feature: ${f.name} -> ${f.path}`);
    }
    sort += 1;
  }
  return group;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    let category = await prisma.moduleNode.findUnique({ where: { key: CATEGORY.key } });
    if (!category) {
      const maxSort = await prisma.moduleNode.aggregate({ where: { parentId: null }, _max: { sort: true } });
      category = await prisma.moduleNode.create({
        data: { key: CATEGORY.key, name: CATEGORY.name, type: 'category', parentId: null, sort: (maxSort._max.sort ?? 0) + 1 },
      });
      console.log('created category: 灵感引擎');
    }
    for (const g of CATEGORY.groups) {
      await upsertGroup(prisma, category.id, g);
    }
    const total = await prisma.moduleNode.count();
    console.log('moduleNode total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('update-hotspot-menu failed:', e.message || e);
  process.exit(1);
});
