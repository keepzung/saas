-- 专业号平台通道（pro.xiaohongshu.com）：组织配置 + KOS 概览/员工快照
CREATE TABLE "ProOrgConfig" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "storageState" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProOrgConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProOrgConfig_brandId_key" ON "ProOrgConfig"("brandId");

CREATE TABLE "ProKosOverview" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "statDate" TIMESTAMP(3) NOT NULL,
    "dateType" INTEGER NOT NULL DEFAULT 2,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "kosAccountNum" INTEGER NOT NULL DEFAULT 0,
    "rtbAccountNum" INTEGER NOT NULL DEFAULT 0,
    "createNoteNum" INTEGER NOT NULL DEFAULT 0,
    "rtbNoteNum" INTEGER NOT NULL DEFAULT 0,
    "socReadCnt" INTEGER NOT NULL DEFAULT 0,
    "adsReadCnt" INTEGER NOT NULL DEFAULT 0,
    "messageOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "messageDrivingOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsNum" INTEGER NOT NULL DEFAULT 0,
    "leadsSuccess" INTEGER NOT NULL DEFAULT 0,
    "rtbIncomeAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProKosOverview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProKosOverview_brandId_statDate_key" ON "ProKosOverview"("brandId", "statDate");
CREATE INDEX "ProKosOverview_brandId_idx" ON "ProKosOverview"("brandId");

CREATE TABLE "ProKosStaff" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "userId" TEXT NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "nickName" TEXT NOT NULL,
    "realName" TEXT,
    "avatar" TEXT,
    "province" TEXT,
    "city" TEXT,
    "createNoteNum" INTEGER NOT NULL DEFAULT 0,
    "rtbNoteNum" INTEGER NOT NULL DEFAULT 0,
    "socImpCnt" INTEGER NOT NULL DEFAULT 0,
    "socClickCnt" INTEGER NOT NULL DEFAULT 0,
    "socEnageCnt" INTEGER NOT NULL DEFAULT 0,
    "messageOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "messageDrivingOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsNum" INTEGER NOT NULL DEFAULT 0,
    "leadsSuccess" INTEGER NOT NULL DEFAULT 0,
    "rtbIncomeAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestsStatus" INTEGER,
    "bindTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProKosStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProKosStaff_brandId_userId_statDate_key" ON "ProKosStaff"("brandId", "userId", "statDate");
CREATE INDEX "ProKosStaff_brandId_statDate_idx" ON "ProKosStaff"("brandId", "statDate");
