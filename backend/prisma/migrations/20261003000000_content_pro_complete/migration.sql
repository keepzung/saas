-- 内容工厂Pro 完善：批量矩阵 + 内容包闭环 + 算力配额 + 创客贴预留
ALTER TABLE "XhsHistory" ADD COLUMN "contentForm" TEXT NOT NULL DEFAULT 'image_text';
ALTER TABLE "XhsHistory" ADD COLUMN "strategyId" INTEGER;
ALTER TABLE "XhsHistory" ADD COLUMN "directionName" TEXT;
ALTER TABLE "XhsHistory" ADD COLUMN "packageId" INTEGER;
ALTER TABLE "XhsHistory" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "XhsHistory" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "XhsHistory" ADD COLUMN "claimedById" INTEGER;
ALTER TABLE "XhsHistory" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "XhsHistory" ADD COLUMN "dispatchedToId" INTEGER;
ALTER TABLE "XhsHistory" ADD COLUMN "dispatchedAt" TIMESTAMP(3);
CREATE INDEX "XhsHistory_packageId_reviewStatus_idx" ON "XhsHistory"("packageId", "reviewStatus");
CREATE INDEX "XhsHistory_batchTaskId_idx" ON "XhsHistory"("batchTaskId");

ALTER TABLE "BatchTask" ADD COLUMN "pointsTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BatchTask" ADD COLUMN "pointsRefunded" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "FactoryPackage" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productId" INTEGER,
    "openFlag" BOOLEAN NOT NULL DEFAULT true,
    "claimOnce" BOOLEAN NOT NULL DEFAULT true,
    "reviewMode" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FactoryPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FactoryPackage_uid_key" ON "FactoryPackage"("uid");
CREATE INDEX "FactoryPackage_brandId_createdAt_idx" ON "FactoryPackage"("brandId", "createdAt");

CREATE TABLE "PackageClaim" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "historyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'h5',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackageClaim_packageId_userId_historyId_key" ON "PackageClaim"("packageId", "userId", "historyId");
CREATE INDEX "PackageClaim_userId_idx" ON "PackageClaim"("userId");
CREATE INDEX "PackageClaim_packageId_idx" ON "PackageClaim"("packageId");

CREATE TABLE "BrandQuota" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandQuota_brandId_key" ON "BrandQuota"("brandId");

CREATE TABLE "QuotaLog" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "userId" INTEGER,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotaLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuotaLog_brandId_createdAt_idx" ON "QuotaLog"("brandId", "createdAt");

CREATE TABLE "CoverEditUsage" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CoverEditUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverEditUsage_userId_day_key" ON "CoverEditUsage"("userId", "day");

ALTER TABLE "XhsHistory" ADD CONSTRAINT "XhsHistory_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "FactoryPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackageClaim" ADD CONSTRAINT "PackageClaim_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "FactoryPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageClaim" ADD CONSTRAINT "PackageClaim_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "XhsHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 东风(7)/格力(8) 初始算力池
INSERT INTO "BrandQuota" ("brandId", "total", "used", "updatedAt") VALUES (7, 2000, 0, CURRENT_TIMESTAMP), (8, 2000, 0, CURRENT_TIMESTAMP) ON CONFLICT ("brandId") DO NOTHING;
