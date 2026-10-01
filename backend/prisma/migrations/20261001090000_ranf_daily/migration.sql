-- ranf 数据查询平台 · 品牌分日合计（运营趋势数据源）
CREATE TABLE "KoxRanfDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "day" TIMESTAMP(3) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impression" BIGINT NOT NULL DEFAULT 0,
    "click" BIGINT NOT NULL DEFAULT 0,
    "interaction" BIGINT NOT NULL DEFAULT 0,
    "msgInquiries" BIGINT NOT NULL DEFAULT 0,
    "msgOpenings" BIGINT NOT NULL DEFAULT 0,
    "msgLeads" BIGINT NOT NULL DEFAULT 0,
    "noteCnt" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoxRanfDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KoxRanfDaily_day_key" ON "KoxRanfDaily"("day");
CREATE INDEX "KoxRanfDaily_brandId_day_idx" ON "KoxRanfDaily"("brandId", "day");