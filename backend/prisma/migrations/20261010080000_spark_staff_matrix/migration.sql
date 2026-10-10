-- 星火 MCC 员工矩阵：主账户/员工号 日明细（brandDetailList/staffDetailList，日分区）
-- CreateTable
CREATE TABLE "SparkStaffBrandDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 2,
    "statDate" TIMESTAMP(3) NOT NULL,
    "brandUserId" TEXT NOT NULL,
    "brandUserName" TEXT NOT NULL,
    "accountType" TEXT,
    "hasOpenKos" BOOLEAN,
    "openKosTime" TEXT,
    "hasAdsBrand" BOOLEAN,
    "rtbAccountNum" INTEGER NOT NULL DEFAULT 0,
    "rtbNoteNum" INTEGER NOT NULL DEFAULT 0,
    "rtbIncomeAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adsReadCnt" INTEGER NOT NULL DEFAULT 0,
    "kosAccountNum" INTEGER NOT NULL DEFAULT 0,
    "createNoteNum" INTEGER NOT NULL DEFAULT 0,
    "socReadCnt" INTEGER NOT NULL DEFAULT 0,
    "fansNum" INTEGER NOT NULL DEFAULT 0,
    "addFansNum" INTEGER NOT NULL DEFAULT 0,
    "lostFansNum" INTEGER NOT NULL DEFAULT 0,
    "messageOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "messageDrivingOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsNum" INTEGER NOT NULL DEFAULT 0,
    "leadsSuccess" INTEGER NOT NULL DEFAULT 0,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SparkStaffBrandDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparkStaffUserDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 2,
    "statDate" TIMESTAMP(3) NOT NULL,
    "brandUserId" TEXT NOT NULL,
    "brandUserName" TEXT,
    "userId" TEXT NOT NULL,
    "staffName" TEXT,
    "nickname" TEXT,
    "accountType" TEXT,
    "bindDate" TEXT,
    "staffArea" TEXT,
    "staffLabel" TEXT,
    "rtbNoteNum" INTEGER NOT NULL DEFAULT 0,
    "rtbIncomeAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adsReadCnt" INTEGER NOT NULL DEFAULT 0,
    "createNoteNum" INTEGER NOT NULL DEFAULT 0,
    "socImpCnt" INTEGER NOT NULL DEFAULT 0,
    "socClickCnt" INTEGER NOT NULL DEFAULT 0,
    "socEnageCnt" INTEGER NOT NULL DEFAULT 0,
    "fansNum" INTEGER NOT NULL DEFAULT 0,
    "addFansNum" INTEGER NOT NULL DEFAULT 0,
    "lostFansNum" INTEGER NOT NULL DEFAULT 0,
    "messageOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "messageDrivingOpenCnt" INTEGER NOT NULL DEFAULT 0,
    "msgLeadsNum" INTEGER NOT NULL DEFAULT 0,
    "leadsSuccess" INTEGER NOT NULL DEFAULT 0,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SparkStaffUserDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SparkStaffBrandDaily_statDate_brandUserId_brandId_key" ON "SparkStaffBrandDaily"("statDate", "brandUserId", "brandId");

-- CreateIndex
CREATE INDEX "SparkStaffBrandDaily_brandId_statDate_idx" ON "SparkStaffBrandDaily"("brandId", "statDate");

-- CreateIndex
CREATE UNIQUE INDEX "SparkStaffUserDaily_statDate_userId_brandId_key" ON "SparkStaffUserDaily"("statDate", "userId", "brandId");

-- CreateIndex
CREATE INDEX "SparkStaffUserDaily_brandId_statDate_idx" ON "SparkStaffUserDaily"("brandId", "statDate");

-- 菜单：运营分析组下新增「员工矩阵分析」（幂等；sort 排组内末尾）
INSERT INTO "ModuleNode" ("key", "name", "icon", "type", "path", "sort", "visible", "parentId")
SELECT 'm_kox_staff_matrix', '员工矩阵分析', NULL, 'feature', '/kox_df/operation-analysis/staff-matrix',
       COALESCE((SELECT MAX("sort") + 1 FROM "ModuleNode" p2 WHERE p2."id" = g."id"), 0), true, g."id"
FROM "ModuleNode" g
WHERE g."name" = '运营分析' AND g."type" = 'group'
  AND NOT EXISTS (SELECT 1 FROM "ModuleNode" x WHERE x."key" = 'm_kox_staff_matrix');