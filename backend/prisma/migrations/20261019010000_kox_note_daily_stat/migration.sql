-- MCC 笔记分析日维度（MDD 总览口径改造）：笔记×日指标历史表
CREATE TABLE "KoxNoteDailyStat" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "noteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "authorName" TEXT,
    "accountId" INTEGER,
    "noteType" TEXT,
    "isRtbAdver" BOOLEAN,
    "exposure" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "collects" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "followCount" INTEGER NOT NULL DEFAULT 0,
    "pmInquiries" INTEGER NOT NULL DEFAULT 0,
    "pmOpenings" INTEGER NOT NULL DEFAULT 0,
    "pmLeads" INTEGER NOT NULL DEFAULT 0,
    "formLeads" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoxNoteDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KoxNoteDailyStat_brandId_noteId_day_key" ON "KoxNoteDailyStat"("brandId", "noteId", "day");
CREATE INDEX "KoxNoteDailyStat_brandId_day_idx" ON "KoxNoteDailyStat"("brandId", "day");
CREATE INDEX "KoxNoteDailyStat_brandId_isRtbAdver_day_idx" ON "KoxNoteDailyStat"("brandId", "isRtbAdver", "day");
