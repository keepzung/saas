-- CreateTable
CREATE TABLE "KosAccount" (
    "id" SERIAL NOT NULL,
    "authorId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'douyin',
    "accountType" TEXT NOT NULL DEFAULT 'KOS',
    "fans" INTEGER NOT NULL DEFAULT 0,
    "areaName" TEXT,
    "storeName" TEXT,
    "accountTag" TEXT,
    "operatorName" TEXT,
    "operatorMobile" TEXT,
    "authorUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KosAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoxTask" (
    "id" SERIAL NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'douyin',
    "taskAccountType" TEXT NOT NULL DEFAULT 'KOS',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ongoing',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoxTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoxTaskAuthor" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "validItemCount" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "displayCount" INTEGER NOT NULL DEFAULT 0,
    "diggCount" INTEGER NOT NULL DEFAULT 0,
    "interaction" INTEGER NOT NULL DEFAULT 0,
    "ces" INTEGER NOT NULL DEFAULT 0,
    "finished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KoxTaskAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoxDailyStat" (
    "id" SERIAL NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'all',
    "authorNum" INTEGER NOT NULL DEFAULT 0,
    "itemCnt" INTEGER NOT NULL DEFAULT 0,
    "crazyItemCnt" INTEGER NOT NULL DEFAULT 0,
    "toolItemCntSum" INTEGER NOT NULL DEFAULT 0,
    "followCountSum" INTEGER NOT NULL DEFAULT 0,
    "exposureSum" INTEGER NOT NULL DEFAULT 0,
    "viewSum" INTEGER NOT NULL DEFAULT 0,
    "interactionSum" INTEGER NOT NULL DEFAULT 0,
    "totalPmInquiries" INTEGER NOT NULL DEFAULT 0,
    "totalPmOpenings" INTEGER NOT NULL DEFAULT 0,
    "totalPmLeads" INTEGER NOT NULL DEFAULT 0,
    "toolClickCnt" INTEGER NOT NULL DEFAULT 0,
    "formLeads" INTEGER NOT NULL DEFAULT 0,
    "adCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adViewSum" INTEGER NOT NULL DEFAULT 0,
    "adConversions" INTEGER NOT NULL DEFAULT 0,
    "liveAccountNum" INTEGER NOT NULL DEFAULT 0,
    "liveCount" INTEGER NOT NULL DEFAULT 0,
    "liveValidDuration" INTEGER NOT NULL DEFAULT 0,
    "liveExposureUv" INTEGER NOT NULL DEFAULT 0,
    "liveWatchUv" INTEGER NOT NULL DEFAULT 0,
    "liveToolClickCnt" INTEGER NOT NULL DEFAULT 0,
    "liveTotalLeads" INTEGER NOT NULL DEFAULT 0,
    "liveFormLeads" INTEGER NOT NULL DEFAULT 0,
    "liveCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "brandId" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KoxDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoxDealerSales" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "modelName" TEXT,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "brandId" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KoxDealerSales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KosAccount_authorId_key" ON "KosAccount"("authorId");

-- CreateIndex
CREATE INDEX "KosAccount_platform_idx" ON "KosAccount"("platform");

-- CreateIndex
CREATE INDEX "KosAccount_accountType_idx" ON "KosAccount"("accountType");

-- CreateIndex
CREATE INDEX "KosAccount_brandId_idx" ON "KosAccount"("brandId");

-- CreateIndex
CREATE INDEX "KoxTask_status_idx" ON "KoxTask"("status");

-- CreateIndex
CREATE INDEX "KoxTask_platform_idx" ON "KoxTask"("platform");

-- CreateIndex
CREATE INDEX "KoxTaskAuthor_taskId_idx" ON "KoxTaskAuthor"("taskId");

-- CreateIndex
CREATE INDEX "KoxTaskAuthor_accountId_idx" ON "KoxTaskAuthor"("accountId");

-- CreateIndex
CREATE INDEX "KoxDailyStat_statDate_idx" ON "KoxDailyStat"("statDate");

-- CreateIndex
CREATE UNIQUE INDEX "KoxDailyStat_statDate_platform_brandId_key" ON "KoxDailyStat"("statDate", "platform", "brandId");

-- CreateIndex
CREATE INDEX "KoxDealerSales_month_idx" ON "KoxDealerSales"("month");

-- AddForeignKey
ALTER TABLE "KoxTaskAuthor" ADD CONSTRAINT "KoxTaskAuthor_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KoxTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoxTaskAuthor" ADD CONSTRAINT "KoxTaskAuthor_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "KosAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
