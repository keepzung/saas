-- 存量用户模块默认集（一次性）：
-- SALES（KOS 员工）→ 最低权限集：任务列表(117) + 小红书图文(110) + 历史记录(113)
UPDATE "User" SET "moduleIds" = ARRAY[117, 110, 113]::INTEGER[]
WHERE "role" = 'SALES' AND COALESCE(array_length("moduleIds", 1), 0) = 0;

-- MANAGER（项目管理员）→ 管理默认集（Perry 当前模块为模板）
UPDATE "User" SET "moduleIds" = (SELECT "moduleIds" FROM "User" WHERE phone = '13375191664')
WHERE "role" = 'MANAGER' AND COALESCE(array_length("moduleIds", 1), 0) = 0;
