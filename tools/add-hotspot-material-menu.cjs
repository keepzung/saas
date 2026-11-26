/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 一次性执行（在生产服务器跑）：灵感引擎「智能创作」分组下新增「素材库」菜单节点，
 * 并把权限授给所有能看到同分组其他页面（爆款拆解/视频工坊等）的非 ADMIN 用户。
 * 幂等：节点按 key 唯一约束，重复跑不会重复插入；授权按 moduleIds 去重。
 * 用法：node tools/add-hotspot-material-menu.cjs
 */
const { execSync } = require('child_process');

const GROUP_NAME = '智能创作';
const FEATURE_KEY = 'm_hotspot_material';
const FEATURE_NAME = '素材库';
const FEATURE_PATH = '/hotspot/materials';

const psql = (sql) =>
  execSync(`sudo -u postgres psql saas_prod -tAc ${JSON.stringify(sql)}`)
    .toString()
    .trim();

const main = () => {
  const group = psql(
    `SELECT id FROM "ModuleNode" WHERE name='${GROUP_NAME}' AND type='group' ORDER BY id LIMIT 1`,
  );
  if (!group) throw new Error(`分组「${GROUP_NAME}」不存在`);
  const groupId = Number(group);

  // 1. 插入 feature 节点（幂等：key 唯一）
  const existing = psql(`SELECT id FROM "ModuleNode" WHERE key='${FEATURE_KEY}'`);
  let featureId;
  if (existing) {
    featureId = Number(existing);
    console.log(`节点已存在 id=${featureId}，跳过插入`);
  } else {
    const maxSort = psql(
      `SELECT COALESCE(MAX(sort), 0) FROM "ModuleNode" WHERE "parentId"=${groupId} AND type='feature'`,
    );
    const row = psql(
      `INSERT INTO "ModuleNode" (key, name, type, path, sort, visible, "parentId") VALUES ('${FEATURE_KEY}', '${FEATURE_NAME}', 'feature', '${FEATURE_PATH}', ${Number(maxSort) + 1}, true, ${groupId}) RETURNING id`,
    );
    featureId = Number(row);
    console.log(`已插入节点 id=${featureId} (${FEATURE_NAME} -> ${FEATURE_PATH})`);
  }

  // 2. 授权：同分组下已有任一 feature 的非 ADMIN 用户，补上新节点 id（moduleIds 是 int[]）
  const groupFeatureIds = psql(
    `SELECT string_agg(id::text, ',') FROM "ModuleNode" WHERE "parentId"=${groupId} AND type='feature'`,
  );
  if (!groupFeatureIds) {
    console.log('同分组无其他 feature，跳过授权');
    return;
  }
  const groupIds = groupFeatureIds.split(',').map(Number);
  const users = psql(
    `SELECT id, "moduleIds" FROM "User" WHERE role <> 'ADMIN' AND array_length("moduleIds", 1) > 0`,
  )
    .split('\n')
    .filter(Boolean);
  let granted = 0;
  for (const line of users) {
    const [idStr, arrStr] = line.split('|');
    if (!idStr || !arrStr) continue;
    const ids = (arrStr || '')
      .replace(/[{}]/g, '')
      .split(',')
      .map(Number)
      .filter(Number.isFinite);
    const hasGroupAccess = ids.some((x) => groupIds.includes(x));
    if (!hasGroupAccess || ids.includes(featureId)) continue;
    const next = `{${[...ids, featureId].join(',')}}`;
    execSync(
      `sudo -u postgres psql saas_prod -c ${JSON.stringify(`UPDATE "User" SET "moduleIds"='${next}'::int[] WHERE id=${Number(idStr)}`)}`,
      { stdio: 'ignore' },
    );
    granted += 1;
  }
  console.log(`授权完成：${granted} 个用户新增「${FEATURE_NAME}」权限（ADMIN 默认全模块无需处理）`);
};

main();
