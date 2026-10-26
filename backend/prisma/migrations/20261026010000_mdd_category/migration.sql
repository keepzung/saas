-- MDD(5) 成交选题雷达：品类归一层（订单品类列 + 品类定义/映射规则表）
-- 品类初版从 9 月底表 38 个品名词频聚出：针织上衣/开衫/外套/马甲/羽绒系列/裤装/裙装/配饰
ALTER TABLE "MddSalesOrder" ADD COLUMN "category" TEXT;

CREATE INDEX "MddSalesOrder_brandId_category_idx" ON "MddSalesOrder"("brandId", "category");

-- 品类定义（运营可维护，品类名唯一）
CREATE TABLE "MddCategoryDef" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MddCategoryDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MddCategoryDef_brandId_name_key" ON "MddCategoryDef"("brandId", "name");

-- 品名/标题 → 品类 映射规则（contains/exact，priority 升序首中命中）
CREATE TABLE "MddCategoryRule" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MddCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MddCategoryRule_brandId_enabled_priority_idx" ON "MddCategoryRule"("brandId", "enabled", "priority");
