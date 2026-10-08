-- 专业号「线索经营→客户管理（旧版）获客工具统计」按日×归属账号
-- belongUserId='' 为全局行（含官号，供对账）；账号行按 KosAccount.authorId 匹配
CREATE TABLE "ProClueToolStatDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "day" TIMESTAMP(3) NOT NULL,
    "belongUserId" TEXT NOT NULL DEFAULT '',
    "consultUserCnt" INTEGER NOT NULL DEFAULT 0,
    "msgChatUserCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "serviceCardLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "qwAddLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "bookCompLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "landingPageLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "wechatLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "appCardLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "otherLeadsUserCnt" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProClueToolStatDaily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProClueToolStatDaily_brandId_day_idx" ON "ProClueToolStatDaily"("brandId", "day");

CREATE UNIQUE INDEX "ProClueToolStatDaily_brandId_day_belongUserId_key" ON "ProClueToolStatDaily"("brandId", "day", "belongUserId");
