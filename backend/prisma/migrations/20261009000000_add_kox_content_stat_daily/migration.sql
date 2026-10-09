-- 聚光「商业内容管理」按日×子账户合计（特斯拉运营总览内容指标权威口径，窗口感知）
CREATE TABLE "KoxContentStatDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "day" TIMESTAMP(3) NOT NULL,
    "vSellerId" TEXT NOT NULL,
    "vSellerName" TEXT,
    "impNum" INTEGER NOT NULL DEFAULT 0,
    "readFeedNum" INTEGER NOT NULL DEFAULT 0,
    "engageCnt" INTEGER NOT NULL DEFAULT 0,
    "followCnt" INTEGER NOT NULL DEFAULT 0,
    "noteNum" INTEGER NOT NULL DEFAULT 0,
    "ziranImpCnt" INTEGER NOT NULL DEFAULT 0,
    "ziranReadCnt" INTEGER NOT NULL DEFAULT 0,
    "tuiguangImpCnt" INTEGER NOT NULL DEFAULT 0,
    "tuiguangReadCnt" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoxContentStatDaily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KoxContentStatDaily_brandId_day_idx" ON "KoxContentStatDaily"("brandId", "day");

CREATE UNIQUE INDEX "KoxContentStatDaily_brandId_day_vSellerId_key" ON "KoxContentStatDaily"("brandId", "day", "vSellerId");
