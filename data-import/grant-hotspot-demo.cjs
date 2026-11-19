#!/usr/bin/env node
// 演示工作区(brand10/11) 成员补授权 m_hotspot 子树（幂等，可重跑）
// 用法: node grant-hotspot-demo.cjs [--brand=11]（缺省 10,11 都补）
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

const brandArg = process.argv.find((a) => a.startsWith('--brand='));
const BRANDS = brandArg ? [Number(brandArg.split('=')[1])] : [10, 11];

const prisma = new PrismaClient();

async function main() {
  const hotspot = await prisma.moduleNode.findUnique({ where: { key: 'm_hotspot' } });
  if (!hotspot) throw new Error('ModuleNode 缺失：m_hotspot（先跑 data-import/update-hotspot-menu.js）');
  const want = new Set([hotspot.id]);
  const collect = async (parentId) => {
    for (const k of await prisma.moduleNode.findMany({ where: { parentId } })) {
      want.add(k.id);
      await collect(k.id);
    }
  };
  await collect(hotspot.id);
  console.log(`m_hotspot 子树节点 ${want.size} 个`);

  for (const brandId of BRANDS) {
    const members = await prisma.brandMember.findMany({ where: { brandId }, select: { userId: true } });
    let granted = 0;
    for (const m of members) {
      const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { id: true, moduleIds: true } });
      if (!u) continue;
      const missing = [...want].filter((id) => !u.moduleIds.includes(id));
      if (!missing.length) continue;
      await prisma.user.update({ where: { id: u.id }, data: { moduleIds: { push: missing } } });
      granted += 1;
    }
    console.log(`brand ${brandId}: 成员 ${members.length} 人，补授权 ${granted} 人`);
  }
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
