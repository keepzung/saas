-- 内容工厂Pro + 内容创作任务（东风奕境7/格力8 AIGC 与任务分发）
ALTER TABLE "BatchTask" ADD COLUMN "config" JSONB;
ALTER TABLE "BatchTask" ADD COLUMN "brandId" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "BatchTask_brandId_idx" ON "BatchTask"("brandId");

CREATE TABLE "MaterialTypeTag" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "parentId" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "perSetting" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialTypeTag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaterialTypeTag_brandId_idx" ON "MaterialTypeTag"("brandId");

CREATE TABLE "MaterialImageSet" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialImageSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaterialImageSet_brandId_idx" ON "MaterialImageSet"("brandId");

CREATE TABLE "MaterialImage" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "setId" INTEGER,
    "typeId" INTEGER,
    "productNodeId" INTEGER,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaterialImage_brandId_idx" ON "MaterialImage"("brandId");
CREATE INDEX "MaterialImage_setId_idx" ON "MaterialImage"("setId");
CREATE INDEX "MaterialImage_typeId_idx" ON "MaterialImage"("typeId");
CREATE INDEX "MaterialImage_productNodeId_idx" ON "MaterialImage"("productNodeId");

CREATE TABLE "WritingStrategy" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "persona" JSONB,
    "sellingPoints" JSONB,
    "audience" JSONB,
    "contentDirections" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WritingStrategy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WritingStrategy_brandId_idx" ON "WritingStrategy"("brandId");

CREATE TABLE "XhsHistory" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "imgList" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "coverUrl" TEXT,
    "batchTaskId" INTEGER,
    "status" INTEGER NOT NULL DEFAULT 0,
    "conversationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "uploadTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "XhsHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XhsHistory_brandId_uploadTime_idx" ON "XhsHistory"("brandId", "uploadTime");

CREATE TABLE "ContentTask" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'xhs',
    "scopeType" TEXT NOT NULL DEFAULT 'all',
    "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "accountTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "exampleImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exampleLink" TEXT,
    "instructions" TEXT,
    "reward" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentTask_brandId_status_idx" ON "ContentTask"("brandId", "status");

CREATE TABLE "ContentTaskTarget" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    CONSTRAINT "ContentTaskTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentTaskTarget_accountId_idx" ON "ContentTaskTarget"("accountId");
CREATE UNIQUE INDEX "ContentTaskTarget_taskId_accountId_key" ON "ContentTaskTarget"("taskId", "accountId");

ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentTaskTarget" ADD CONSTRAINT "ContentTaskTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ContentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentTaskTarget" ADD CONSTRAINT "ContentTaskTarget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "KosAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialImage" ADD CONSTRAINT "MaterialImage_setId_fkey" FOREIGN KEY ("setId") REFERENCES "MaterialImageSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialImage" ADD CONSTRAINT "MaterialImage_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MaterialTypeTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
