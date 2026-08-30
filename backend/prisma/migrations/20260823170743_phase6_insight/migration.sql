-- CreateTable
CREATE TABLE "InsightContent" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'douyin',
    "contentType" TEXT NOT NULL DEFAULT 'note',
    "title" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorType" TEXT NOT NULL DEFAULT 'KOC',
    "publishAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "collects" INTEGER NOT NULL DEFAULT 0,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "irrelevant" BOOLEAN NOT NULL DEFAULT false,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightDailyStat" (
    "id" SERIAL NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'all',
    "contentCnt" INTEGER NOT NULL DEFAULT 0,
    "mentionCnt" INTEGER NOT NULL DEFAULT 0,
    "viewSum" INTEGER NOT NULL DEFAULT 0,
    "likeSum" INTEGER NOT NULL DEFAULT 0,
    "commentSum" INTEGER NOT NULL DEFAULT 0,
    "shareSum" INTEGER NOT NULL DEFAULT 0,
    "negativeCnt" INTEGER NOT NULL DEFAULT 0,
    "brandId" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InsightDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'public',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightContent_brandId_idx" ON "InsightContent"("brandId");

-- CreateIndex
CREATE INDEX "InsightContent_platform_idx" ON "InsightContent"("platform");

-- CreateIndex
CREATE INDEX "InsightContent_sentiment_idx" ON "InsightContent"("sentiment");

-- CreateIndex
CREATE INDEX "InsightContent_publishAt_idx" ON "InsightContent"("publishAt");

-- CreateIndex
CREATE INDEX "InsightDailyStat_statDate_idx" ON "InsightDailyStat"("statDate");

-- CreateIndex
CREATE UNIQUE INDEX "InsightDailyStat_statDate_platform_brandId_key" ON "InsightDailyStat"("statDate", "platform", "brandId");

-- CreateIndex
CREATE INDEX "InsightReport_brandId_idx" ON "InsightReport"("brandId");
