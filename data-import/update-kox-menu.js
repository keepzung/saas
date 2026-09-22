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

const CATEGORY_KEY = 'm_kox';

const OPERATION_FEATURES = [
  { name: '运营总览', path: '/kox_df/operation-analysis/overview' },
  { name: '区域排行', path: '/kox_df/operation-analysis/region-ranking' },
  { name: '经销商排行', path: '/kox_df/operation-analysis/dealer-ranking' },
  { name: '账号排行', path: '/kox_df/operation-analysis/author-ranking' },
  { name: '笔记排行', path: '/kox_df/operation-analysis/note-ranking' },
];

const REMOVE_PATHS = [
  '/kox_df/operation-analysis/ranking',
  '/kox_df/operation-analysis/model-sales',
  '/kox_df/operation-analysis/dealer',
  '/kox_df/operation-analysis/feedback',
  '/kox_df/operation-analysis/ai-briefing',
];

const CAMPAIGN_FEATURES = [
  { name: '投放计划', path: '/kox_df/campaign-analysis/plans' },
  { name: '项目报表', path: '/kox_df/campaign-analysis/project-reports' },
  { name: '新增项目', path: '/kox_df/campaign-analysis/add' },
];

// 曾经存在过的节点（本地曾短暂改成经销商/总部总览，需清理）
const CAMPAIGN_STALE_PATHS = [
  '/kox_df/campaign-analysis/dealer-overview',
  '/kox_df/campaign-analysis/hq-overview',
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const category = await prisma.moduleNode.findUnique({
      where: { key: CATEGORY_KEY },
    });
    if (!category) throw new Error('category m_kox not found');

    const groups = await prisma.moduleNode.findMany({
      where: { parentId: category.id, type: 'group' },
      orderBy: { sort: 'asc' },
    });

    const opGroup =
      groups.find((g) => g.name === '运营分析') ?? null;
    if (!opGroup) throw new Error('group 运营分析 not found under m_kox');

    // 1) remove legacy feature nodes
    for (const p of REMOVE_PATHS) {
      const node = await prisma.moduleNode.findFirst({
        where: { parentId: opGroup.id, type: 'feature', path: p },
      });
      if (node) {
        await prisma.moduleNode.delete({ where: { id: node.id } });
        console.log('removed feature:', node.name, p);
      }
    }

    // 2) upsert desired features with stable ordering
    let sort = 0;
    for (const f of OPERATION_FEATURES) {
      const existing = await prisma.moduleNode.findFirst({
        where: { parentId: opGroup.id, type: 'feature', path: f.path },
      });
      if (existing) {
        if (existing.name !== f.name || existing.sort !== sort) {
          await prisma.moduleNode.update({
            where: { id: existing.id },
            data: { name: f.name, sort },
          });
          console.log('updated feature:', f.name, f.path);
        } else {
          console.log('feature ok:', f.name, f.path);
        }
      } else {
        await prisma.moduleNode.create({
          data: {
            key: `${opGroup.key}_f_${f.path.split('/').pop()}`,
            name: f.name,
            type: 'feature',
            path: f.path,
            parentId: opGroup.id,
            sort,
          },
        });
        console.log('created feature:', f.name, f.path);
      }
      sort += 1;
    }

    // 3) campaign analysis group (create after operation group)
    let campaignGroup = groups.find((g) => g.name === '投放分析');
    if (!campaignGroup) {
      const insertAt = opGroup.sort + 1;
      const later = groups.filter(
        (g) => g.id !== opGroup.id && g.sort >= insertAt,
      );
      for (const g of later) {
        await prisma.moduleNode.update({
          where: { id: g.id },
          data: { sort: g.sort + 1 },
        });
      }
      campaignGroup = await prisma.moduleNode.create({
        data: {
          key: `${CATEGORY_KEY}_g_campaign`,
          name: '投放分析',
          type: 'group',
          parentId: category.id,
          sort: insertAt,
        },
      });
      console.log('created group: 投放分析');
    }
    let cSort = 0;
    for (const f of CAMPAIGN_FEATURES) {
      const key = `${campaignGroup.key}_f_${f.path.split('/').pop()}`;
      let existing = await prisma.moduleNode.findFirst({
        where: { parentId: campaignGroup.id, type: 'feature', path: f.path },
      });
      if (!existing) {
        existing = await prisma.moduleNode.findUnique({ where: { key } }).catch(() => null);
      }
      if (existing) {
        if (existing.name !== f.name || existing.sort !== cSort || existing.path !== f.path) {
          await prisma.moduleNode.update({
            where: { id: existing.id },
            data: { name: f.name, path: f.path, sort: cSort },
          });
        }
        console.log('campaign feature ok:', f.name);
      } else {
        await prisma.moduleNode.create({
          data: {
            key,
            name: f.name,
            type: 'feature',
            path: f.path,
            parentId: campaignGroup.id,
            sort: cSort,
          },
        });
        console.log('created campaign feature:', f.name);
      }
      cSort += 1;
    }

    // 清理历史残留（经销商/总部总览等）
    for (const p of CAMPAIGN_STALE_PATHS) {
      const node = await prisma.moduleNode.findFirst({
        where: { parentId: campaignGroup.id, type: 'feature', path: p },
      });
      if (node) {
        await prisma.moduleNode.delete({ where: { id: node.id } });
        console.log('removed stale feature:', node.name, p);
      }
    }

    const total = await prisma.moduleNode.count();
    console.log('moduleNode total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('update-kox-menu failed:', e.message || e);
  process.exit(1);
});
