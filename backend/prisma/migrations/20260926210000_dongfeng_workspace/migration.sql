-- 东风奕境工作区（brandId=7）：账号扩展字段 + 经销商/区域投放快照表 + 项目大区
ALTER TABLE "KosAccount" ADD COLUMN "storeCode" TEXT;
ALTER TABLE "KosAccount" ADD COLUMN "noteQuality" INTEGER;
ALTER TABLE "KoxCampaignProject" ADD COLUMN "region" TEXT;

CREATE TABLE "KoxDealerSnapshot" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "dealerName" TEXT NOT NULL,
    "regionName" TEXT,
    "cityName" TEXT,
    "tier" TEXT,
    "score" DECIMAL(10,2),
    "accountCnt" INTEGER NOT NULL DEFAULT 0,
    "publishCnt" INTEGER NOT NULL DEFAULT 0,
    "contentPct" DECIMAL(10,2),
    "exposure" INTEGER NOT NULL DEFAULT 0,
    "exposurePct" DECIMAL(10,2),
    "inquiries" INTEGER NOT NULL DEFAULT 0,
    "openings" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "leadsPct" DECIMAL(10,2),
    "deals" INTEGER NOT NULL DEFAULT 0,
    "dealsPct" DECIMAL(10,2),
    "statMonth" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KoxDealerSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KoxDealerSnapshot_brandId_statMonth_idx" ON "KoxDealerSnapshot"("brandId", "statMonth");

CREATE TABLE "KoxRegionAdSnapshot" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "regionName" TEXT NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accountCnt" INTEGER NOT NULL DEFAULT 0,
    "noteCnt" INTEGER NOT NULL DEFAULT 0,
    "replyRate" DECIMAL(10,2),
    "inquiries" INTEGER NOT NULL DEFAULT 0,
    "openings" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "openRate" DECIMAL(10,2),
    "openLeadRate" DECIMAL(10,2),
    "inquiryCost" DECIMAL(14,2),
    "openCost" DECIMAL(14,2),
    "leadCost" DECIMAL(14,2),
    "statDate" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KoxRegionAdSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KoxRegionAdSnapshot_brandId_statDate_idx" ON "KoxRegionAdSnapshot"("brandId", "statDate");