-- 任务详情路由加入模块白名单体系（visible=false：不进侧栏菜单，仅供路由守卫放行）
INSERT INTO "ModuleNode" ("name", "path", "parentId", "type", "sort", "visible")
SELECT '任务详情', '/kox_task/content-task/task-detail', 116, 'feature', 3, false
WHERE NOT EXISTS (SELECT 1 FROM "ModuleNode" WHERE path = '/kox_task/content-task/task-detail');

-- 项目管理员（Perry）追加任务详情节点（此前只有列表/创建，点查看详情会被白名单弹回）
UPDATE "User"
SET "moduleIds" = "moduleIds" || ARRAY[(SELECT id FROM "ModuleNode" WHERE path = '/kox_task/content-task/task-detail')]
WHERE "phone" = '13375191664'
  AND NOT ((SELECT id FROM "ModuleNode" WHERE path = '/kox_task/content-task/task-detail') = ANY("moduleIds"));
