-- MDD(5) 成交选题雷达：初版品类体系与映射规则（来自 9 月底表 38 个品名词频，2026-10-26）
-- 品类：针织上衣/开衫/外套/马甲/羽绒系列/裤装/裙装/配饰（匹配顺序=priority 升序）

INSERT INTO "MddCategoryDef" ("brandId", "name", "sort", "enabled", "remark", "createdAt", "updatedAt") VALUES
  (5, '针织上衣', 1, true, '针织长袖/短袖/T恤/衬衫/POLO/卫衣等上衣内搭', NOW(), NOW()),
  (5, '开衫',     2, true, '针织开衫', NOW(), NOW()),
  (5, '外套',     3, true, '针织外套/外套/马甲外套', NOW(), NOW()),
  (5, '马甲',     4, true, '针织马甲（羽绒马甲归羽绒系列）', NOW(), NOW()),
  (5, '羽绒系列', 5, true, '羽绒服/羽绒马甲/羽绒配饰', NOW(), NOW()),
  (5, '裤装',     6, true, '长裤/针织长裤/卫裤', NOW(), NOW()),
  (5, '裙装',     7, true, '短裙/半裙/连衣裙', NOW(), NOW()),
  (5, '配饰',     8, true, '袜/帽/围巾/包/巾/抱被', NOW(), NOW())
ON CONFLICT ("brandId", "name") DO NOTHING;

INSERT INTO "MddCategoryRule" ("brandId", "pattern", "matchType", "category", "priority", "enabled", "remark", "createdAt", "updatedAt") VALUES
  (5, '羽绒', 'contains', '羽绒系列', 10, true, '羽绒马甲/羽绒围巾优先归羽绒系列', NOW(), NOW()),
  (5, '开衫', 'contains', '开衫',     20, true, NULL, NOW(), NOW()),
  (5, '外套', 'contains', '外套',     30, true, '含马甲外套', NOW(), NOW()),
  (5, '马甲', 'contains', '马甲',     40, true, '普通马甲（羽绒/外套先行）', NOW(), NOW()),
  (5, '裤',   'contains', '裤装',     50, true, NULL, NOW(), NOW()),
  (5, '裙',   'contains', '裙装',     60, true, NULL, NOW(), NOW()),
  (5, '袜',   'contains', '配饰',     70, true, NULL, NOW(), NOW()),
  (5, '帽',   'contains', '配饰',     71, true, NULL, NOW(), NOW()),
  (5, '围巾', 'contains', '配饰',     72, true, NULL, NOW(), NOW()),
  (5, '包',   'contains', '配饰',     73, true, NULL, NOW(), NOW()),
  (5, '巾',   'contains', '配饰',     74, true, '吸汗巾等（围巾先行）', NOW(), NOW()),
  (5, '抱被', 'contains', '配饰',     75, true, '婴儿抱被', NOW(), NOW()),
  (5, '衫',   'contains', '针织上衣', 80, true, '衬衫/POLO衫', NOW(), NOW()),
  (5, '卫衣', 'contains', '针织上衣', 81, true, NULL, NOW(), NOW()),
  (5, '袖',   'contains', '针织上衣', 82, true, '长袖/短袖（含T恤变体）', NOW(), NOW()),
  (5, '恤',   'contains', '针织上衣', 83, true, 'T恤', NOW(), NOW()),
  (5, '上衣', 'contains', '针织上衣', 84, true, NULL, NOW(), NOW()),
  (5, '针织', 'contains', '针织上衣', 90, true, '兜底剩余针织品', NOW(), NOW());
