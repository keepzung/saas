-- CreateTable
CREATE TABLE "KoxCampaignDailyStat" (
    "id" SERIAL NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "virtualSellerId" TEXT NOT NULL,
    "brandUserId" TEXT,
    "brandUserName" TEXT,
    "advertiserId" TEXT,
    "accountKind" TEXT NOT NULL DEFAULT 'brand',
    "agentName" TEXT,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impression" INTEGER NOT NULL DEFAULT 0,
    "click" INTEGER NOT NULL DEFAULT 0,
    "likeCnt" INTEGER NOT NULL DEFAULT 0,
    "commentCnt" INTEGER NOT NULL DEFAULT 0,
    "collectCnt" INTEGER NOT NULL DEFAULT 0,
    "shareCnt" INTEGER NOT NULL DEFAULT 0,
    "interaction" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsNum" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "brandId" INTEGER NOT NULL DEFAULT 2,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoxCampaignDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparkAccount" (
    "id" SERIAL NOT NULL,
    "virtualSellerId" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountKind" TEXT NOT NULL DEFAULT 'brand',
    "name" TEXT NOT NULL,
    "brandUserId" TEXT,
    "agentName" TEXT,
    "advertiserId" TEXT,
    "lastConsumeDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brandId" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "SparkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparkSyncLog" (
    "id" SERIAL NOT NULL,
    "syncType" TEXT NOT NULL,
    "statDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "accountsAdded" INTEGER NOT NULL DEFAULT 0,
    "accountsRemoved" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SparkSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KoxCampaignDailyStat_statDate_brandId_idx" ON "KoxCampaignDailyStat"("statDate", "brandId");

-- CreateIndex
CREATE INDEX "KoxCampaignDailyStat_brandUserId_idx" ON "KoxCampaignDailyStat"("brandUserId");

-- CreateIndex
CREATE UNIQUE INDEX "KoxCampaignDailyStat_statDate_virtualSellerId_key" ON "KoxCampaignDailyStat"("statDate", "virtualSellerId");

-- CreateIndex
CREATE UNIQUE INDEX "SparkAccount_virtualSellerId_key" ON "SparkAccount"("virtualSellerId");

-- CreateIndex
CREATE INDEX "SparkAccount_brandId_active_idx" ON "SparkAccount"("brandId", "active");

-- CreateIndex
CREATE INDEX "SparkSyncLog_syncType_createdAt_idx" ON "SparkSyncLog"("syncType", "createdAt");
