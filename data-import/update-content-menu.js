// 内容工厂Pro（m_factory 分类）+ 内容创作任务（m_kox 新组）菜单同步（幂等）
// 用法: node update-content-menu.js
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

const FACTORY_CATEGORY = {
  key: 'm_factory',
  name: '内容工厂Pro',
  groups: [
    {
      key: 'm_factory_g0',
      name: '工作台',
      features: [
        { name: '总览', path: '/content-pro/workbench' },
      ],
    },
    {
      key: 'm_factory_g1',
      name: '资料&策略',
      features: [
        { name: '资料库', path: '/content-pro/config/products' },
        { name: '素材库', path: '/content-pro/config/material' },
        { name: '创作策略Pro', path: '/content-pro/config/strategies' },
      ],
    },
    {
      key: 'm_factory_g2',
      name: '内容生产',
      features: [
        { name: '小红书图文', path: '/content-pro/content-factory/xhs-image-text-single' },
        { name: '小红书图文(批量)', path: '/content-pro/content-factory/xhs-image-text-batch' },
        { name: '评论维护', path: '/content-pro/comment' },
        { name: '历史记录', path: '/content-pro/history' },
      ],
    },
    {
      key: 'm_factory_g3',
      name: '内容管理',
      features: [
        { name: '内容包Pro', path: '/content-pro/package' },
        { name: '内容审核', path: '/content-pro/audit' },
        { name: '领用记录', path: '/content-pro/claim-log' },
      ],
    },
    {
      key: 'm_factory_g4',
      name: '热门内容分析',
      features: [
        { name: '热门内容分析', path: '/content-pro/hot-content' },
      ],
    },
  ],
};

const TASK_GROUP = {
  key: 'm_kox_g_task2',
  name: '内容创作任务',
  features: [
    { name: '任务列表', path: '/kox_task/content-task/task-list' },
    { name: '派发新任务', path: '/kox_task/content-task/create-task' },
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
    // 1) 内容工厂Pro 分类（放在 内容中心Pro 之后）
    let factory = await prisma.moduleNode.findUnique({ where: { key: FACTORY_CATEGORY.key } });
    if (!factory) {
      const anchor = await prisma.moduleNode.findUnique({ where: { key: 'm_content_pro' } });
      const maxSort = await prisma.moduleNode.aggregate({ where: { parentId: null }, _max: { sort: true } });
      let insertAt = (maxSort._max.sort ?? 0) + 1;
      if (anchor) {
        const later = await prisma.moduleNode.findMany({
          where: { parentId: null, sort: { gt: anchor.sort } },
          orderBy: { sort: 'asc' },
        });
        insertAt = anchor.sort + 1;
        for (const n of later) {
          await prisma.moduleNode.update({ where: { id: n.id }, data: { sort: n.sort + 1 } });
        }
      }
      factory = await prisma.moduleNode.create({
        data: { key: FACTORY_CATEGORY.key, name: FACTORY_CATEGORY.name, type: 'category', parentId: null, sort: insertAt },
      });
      console.log('created category: 内容工厂Pro');
    }
    for (const g of FACTORY_CATEGORY.groups) {
      await upsertGroup(prisma, factory.id, g);
    }

    // 2) 内容创作任务组（挂在 m_kox 分类末尾）
    const kox = await prisma.moduleNode.findUnique({ where: { key: 'm_kox' } });
    if (!kox) throw new Error('category m_kox not found');
    await upsertGroup(prisma, kox.id, TASK_GROUP);

    const total = await prisma.moduleNode.count();
    console.log('moduleNode total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('update-content-menu failed:', e.message || e);
  process.exit(1);
});
