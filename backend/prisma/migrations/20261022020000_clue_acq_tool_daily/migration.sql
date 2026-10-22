-- MCC 线索分析·获客工具统计日维度（归属账户×日：私信进线/开口总数 + 留资组件拆分）
-- MDD 漏斗进线/开口权威口径；自然 = 总数 − 聚光投放日报私信咨询/开口（2026-10-22 客户口径）
CREATE TABLE "ClueAcqToolDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "day" TIMESTAMP(3) NOT NULL,
    "subUserId" TEXT NOT NULL,
    "subUserName" TEXT,
    "consultCnt" INTEGER NOT NULL DEFAULT 0,
    "chatCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeads" INTEGER NOT NULL DEFAULT 0,
    "serviceCardLeads" INTEGER NOT NULL DEFAULT 0,
    "wecomCardLeads" INTEGER NOT NULL DEFAULT 0,
    "bookingLeads" INTEGER NOT NULL DEFAULT 0,
    "landingPageLeads" INTEGER NOT NULL DEFAULT 0,
    "wechatCopyLeads" INTEGER NOT NULL DEFAULT 0,
    "tradeCardLeads" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClueAcqToolDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClueAcqToolDaily_brandId_day_subUserId_key" ON "ClueAcqToolDaily"("brandId", "day", "subUserId");
CREATE INDEX "ClueAcqToolDaily_brandId_day_idx" ON "ClueAcqToolDaily"("brandId", "day");
