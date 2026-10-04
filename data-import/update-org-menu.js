// 系统管理菜单追加「组织管理」（/system/orgs，用户管理同级）
// 幂等：按 key 查重；运行: node update-org-menu.js
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

const ORG_FEATURE = { key: 'm_system_g0_f_orgs', name: '组织管理', path: '/system/orgs', icon: 'ApartmentOutlined' };

async function main() {
  const prisma = new PrismaClient();
  try {
    // 找到 用户管理（/users/manage）所在的 group
    const usersNode = await prisma.moduleNode.findFirst({
      where: { path: '/users/manage' },
      select: { id: true, parentId: true },
    });
    if (!usersNode) {
      console.error('未找到 /users/manage 节点，无法定位系统管理分组');
      process.exit(1);
    }
    const exists = await prisma.moduleNode.findUnique({ where: { key: ORG_FEATURE.key } });
    if (exists) {
      await prisma.moduleNode.update({
        where: { key: ORG_FEATURE.key },
        data: { name: ORG_FEATURE.name, path: ORG_FEATURE.path, parentId: usersNode.parentId },
      });
      console.log('组织管理菜单已更新');
    } else {
      const maxSort = await prisma.moduleNode.findFirst({
        where: { parentId: usersNode.parentId },
        orderBy: { sort: 'desc' },
        select: { sort: true },
      });
      await prisma.moduleNode.create({
        data: {
          key: ORG_FEATURE.key,
          name: ORG_FEATURE.name,
          path: ORG_FEATURE.path,
          type: 'feature',
          parentId: usersNode.parentId,
          visible: true,
          sort: (maxSort?.sort ?? 0) + 1,
        },
      });
      console.log('组织管理菜单已创建，parentId=', usersNode.parentId);
    }
    const total = await prisma.moduleNode.count();
    console.log('module nodes:', total);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
