-- MCC 线索分析日维度（MDD 线索权威口径：广告/自然线索拆分 + 归属账户 + 留资用户数）
CREATE TABLE "ClueAnalysisDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "day" TIMESTAMP(3) NOT NULL,
    "subUserId" TEXT NOT NULL,
    "subUserName" TEXT,
    "proUserId" TEXT,
    "proUserName" TEXT,
    "clueCnt" INTEGER NOT NULL DEFAULT 0,
    "adsClueCnt" INTEGER NOT NULL DEFAULT 0,
    "natureClueCnt" INTEGER NOT NULL DEFAULT 0,
    "leadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClueAnalysisDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClueAnalysisDaily_brandId_day_subUserId_key" ON "ClueAnalysisDaily"("brandId", "day", "subUserId");
CREATE INDEX "ClueAnalysisDaily_brandId_day_idx" ON "ClueAnalysisDaily"("brandId", "day");
