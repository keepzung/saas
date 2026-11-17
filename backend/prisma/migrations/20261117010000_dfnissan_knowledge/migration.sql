-- 东风日产建设项：智能内容四分类/双风格/AI预审 + 品牌模板/规则库/案例库/报表
ALTER TABLE "XhsHistory" ADD COLUMN "noteKind" TEXT;
ALTER TABLE "XhsHistory" ADD COLUMN "style" TEXT;
ALTER TABLE "XhsHistory" ADD COLUMN "aiScore" INTEGER;
ALTER TABLE "XhsHistory" ADD COLUMN "aiAudit" JSONB;
ALTER TABLE "XhsHistory" ADD COLUMN "scriptJson" JSONB;

-- 品牌专属模板：话术规范 / 车型内容模板 / 合规审核模板 / 门店人设模板
CREATE TABLE "BrandTemplate" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTemplate_pkey" PRIMARY KEY ("id")
);

-- 知识库规则：评论运营 / 私信接待 / 分流转接 / 合规红线
CREATE TABLE "KnowledgeRule" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'flag',
    "replyHint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRule_pkey" PRIMARY KEY ("id")
);

-- 案例库：爆款案例 / 优质内容拆解 / 竞品动态
CREATE TABLE "KnowledgeCase" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'hot',
    "platform" TEXT,
    "summary" TEXT,
    "structureJson" JSONB,
    "hotContentId" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCase_pkey" PRIMARY KEY ("id")
);

-- 运营报表：日报 / 周报 / 月报
CREATE TABLE "BrandReport" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandReport_brandId_type_period_key" ON "BrandReport"("brandId", "type", "period");
CREATE INDEX "BrandTemplate_brandId_kind_idx" ON "BrandTemplate"("brandId", "kind");
CREATE INDEX "KnowledgeRule_brandId_category_idx" ON "KnowledgeRule"("brandId", "category");
CREATE INDEX "KnowledgeCase_brandId_category_idx" ON "KnowledgeCase"("brandId", "category");
CREATE INDEX "BrandReport_brandId_type_idx" ON "BrandReport"("brandId", "type");
