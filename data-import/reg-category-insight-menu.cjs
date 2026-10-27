// 菜单注册：运营分析组下插入「种草转化分析」（MDD 独占；其他品牌前端 BRAND_HIDDEN_MENUS 隐藏）
// 并给 ADMIN 用户 + brand5 BrandMember 用户 moduleIds 追加该节点
// 服务器执行：ssh root@marketineok.com → node /opt/saas/data-import/reg-category-insight-menu.cjs
const { PrismaClient } = require('/opt/saas/backend/node_modules/@prisma/client');
const p = new PrismaClient();
(async () => {
  // 1. 找运营分析组（线上为 group 类型，key=m_kox_g0；兼容 category）
  const opGroup = await p.moduleNode.findFirst({ where: { name: '运营分析', type: { in: ['group', 'category'] } } });
  if (!opGroup) { console.error('未找到 运营分析 节点'); process.exit(1); }
  console.log('运营分析组 id=', opGroup.id, 'type=', opGroup.type);

  // 2. upsert 种草转化分析节点（排在销售看板后）
  const existing = await p.moduleNode.findUnique({ where: { key: 'mdd_category_insight' } });
  const node = existing
    ? await p.moduleNode.update({ where: { key: 'mdd_category_insight' }, data: { name: '种草转化分析', path: '/kox_df/sales/category-insight', parentId: opGroup.id, type: 'feature', visible: true } })
    : await p.moduleNode.create({
        data: {
          key: 'mdd_category_insight',
          name: '种草转化分析',
          path: '/kox_df/sales/category-insight',
          parentId: opGroup.id,
          type: 'feature',
          sort: 61,
          visible: true,
        },
      });
  console.log('种草转化分析节点 id=', node.id);

  // 3. 用户 moduleIds 追加（ADMIN 全部 + brand5 成员）
  const admins = await p.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, moduleIds: true } });
  const m5 = await p.user.findMany({ where: { brandMembers: { some: { brandId: 5 } } }, select: { id: true, moduleIds: true } });
  const targets = new Map();
  for (const u of [...admins, ...m5]) targets.set(u.id, u.moduleIds ?? []);
  let appended = 0;
  for (const [id, mods] of targets) {
    if (mods.includes(node.id)) continue;
    await p.user.update({ where: { id }, data: { moduleIds: { push: node.id } } });
    appended += 1;
  }
  console.log(`moduleIds 追加用户数: ${appended}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
