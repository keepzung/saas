-- 星火多组织：新增组织配置表 + 同步日志品牌维度
CREATE TABLE "SparkOrgConfig" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "orgCode" TEXT NOT NULL,
    "email" TEXT,
    "cookie" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SparkOrgConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SparkOrgConfig_brandId_key" ON "SparkOrgConfig"("brandId");

ALTER TABLE "SparkSyncLog" ADD COLUMN "brandId" INTEGER NOT NULL DEFAULT 2;

CREATE INDEX "SparkSyncLog_brandId_syncType_statDate_idx" ON "SparkSyncLog"("brandId", "syncType", "statDate");
