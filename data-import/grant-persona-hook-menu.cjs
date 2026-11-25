// 给已开通内容工厂Pro的成员追加「人设管理/钩子管理」菜单授权（幂等，可重复跑）
// 前置：先跑 node update-content-menu.js 创建菜单节点
// 用法: node grant-persona-hook-menu.cjs
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

const NEW_PATHS = ['/content-pro/config/personas', '/content-pro/config/hooks'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const factory = await prisma.moduleNode.findUnique({ where: { key: 'm_factory' } });
    if (!factory) throw new Error('m_factory category not found — 先跑 update-content-menu.js');
    const groups = await prisma.moduleNode.findMany({ where: { parentId: factory.id, type: 'group' } });
    const features = await prisma.moduleNode.findMany({
      where: { parentId: { in: groups.map((g) => g.id) }, type: 'feature' },
    });
    if (!features.length) throw new Error('m_factory has no features');
    const newNodeIds = features.filter((f) => NEW_PATHS.includes(f.path)).map((f) => f.id);
    if (newNodeIds.length !== NEW_PATHS.length) {
      throw new Error(`菜单节点缺失（找到 ${newNodeIds.length}/${NEW_PATHS.length}）— 先跑 update-content-menu.js`);
    }
    // 授权对象 = 已有任何内容工厂Pro菜单权限的用户（含 ADMIN 以外的全部使用者）
    const users = await prisma.user.findMany({
      where: { moduleIds: { hasSome: features.map((f) => f.id) } },
      select: { id: true, moduleIds: true },
    });
    let granted = 0;
    for (const u of users) {
      const missing = newNodeIds.filter((id) => !u.moduleIds.includes(id));
      if (!missing.length) continue;
      await prisma.user.update({ where: { id: u.id }, data: { moduleIds: { push: missing } } });
      granted += 1;
      console.log(`granted user ${u.id}: +${missing.join(',')}`);
    }
    console.log(`users scanned=${users.length}, granted=${granted} (其余已是全量,幂等跳过)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('grant-persona-hook-menu failed:', e.message || e);
  process.exit(1);
});
