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

const CATEGORY_KEY = 'm_laigu';
const GROUP_KEY = 'm_laigu_g_leads';
const FEATURE_PATH = '/laigu/leads';

async function main() {
  const prisma = new PrismaClient();
  try {
    const roots = await prisma.moduleNode.findMany({
      where: { parentId: null },
      orderBy: { sort: 'asc' },
    });

    let category = await prisma.moduleNode.findUnique({
      where: { key: CATEGORY_KEY },
    });
    if (!category) {
      const insertAt = (roots[roots.length - 1]?.sort ?? -1) + 1;
      category = await prisma.moduleNode.create({
        data: {
          key: CATEGORY_KEY,
          name: '来鼓私信',
          icon: 'MessageOutlined',
          type: 'category',
          sort: insertAt,
        },
      });
      console.log('created category: 来鼓私信 sort=', insertAt);
    } else {
      console.log('category ok: 来鼓私信');
    }

    let group = await prisma.moduleNode.findUnique({ where: { key: GROUP_KEY } });
    if (!group) {
      group = await prisma.moduleNode.create({
        data: {
          key: GROUP_KEY,
          name: '线索中心',
          type: 'group',
          parentId: category.id,
          sort: 0,
        },
      });
      console.log('created group: 线索中心');
    } else {
      console.log('group ok: 线索中心');
    }

    let feature = await prisma.moduleNode.findFirst({
      where: { parentId: group.id, type: 'feature', path: FEATURE_PATH },
    });
    if (!feature) {
      feature = await prisma.moduleNode.create({
        data: {
          key: `${GROUP_KEY}_f_leads`,
          name: '私信线索',
          type: 'feature',
          path: FEATURE_PATH,
          parentId: group.id,
          sort: 0,
        },
      });
      console.log('created feature: 私信线索', FEATURE_PATH);
    } else if (feature.name !== '私信线索') {
      await prisma.moduleNode.update({
        where: { id: feature.id },
        data: { name: '私信线索' },
      });
      console.log('updated feature name: 私信线索');
    } else {
      console.log('feature ok: 私信线索');
    }

    const total = await prisma.moduleNode.count();
    console.log('moduleNode total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('update-laigu-menu failed:', e.message || e);
  process.exit(1);
});
