-- 专业号「线索经营」按日聚合 + 客户×日明细（brand 6 特斯拉，KOS-only 剔除官号）
CREATE TABLE "ProClueDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "day" TIMESTAMP(3) NOT NULL,
    "enterKos" INTEGER NOT NULL DEFAULT 0,
    "openKos" INTEGER NOT NULL DEFAULT 0,
    "leadsKos" INTEGER NOT NULL DEFAULT 0,
    "enterAll" INTEGER NOT NULL DEFAULT 0,
    "openAll" INTEGER NOT NULL DEFAULT 0,
    "leadsAll" INTEGER NOT NULL DEFAULT 0,
    "cardEnterNotOpen" INTEGER NOT NULL DEFAULT 0,
    "cardOpenNotLeads" INTEGER NOT NULL DEFAULT 0,
    "cardLeadsDone" INTEGER NOT NULL DEFAULT 0,
    "cardAdTraffic" INTEGER NOT NULL DEFAULT 0,
    "cardOrganic" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProClueDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProClueDaily_brandId_day_key" ON "ProClueDaily"("brandId", "day");
CREATE INDEX "ProClueDaily_brandId_day_idx" ON "ProClueDaily"("brandId", "day");

CREATE TABLE "ProClueUserDay" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "day" TIMESTAMP(3) NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "belongUserId" TEXT,
    "belongUserName" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "entered" BOOLEAN NOT NULL DEFAULT false,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "leads" BOOLEAN NOT NULL DEFAULT false,
    "sysTagId" INTEGER,
    "nickName" TEXT,
    CONSTRAINT "ProClueUserDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProClueUserDay_brandId_day_customerUserId_key" ON "ProClueUserDay"("brandId", "day", "customerUserId");
CREATE INDEX "ProClueUserDay_brandId_day_idx" ON "ProClueUserDay"("brandId", "day");
CREATE INDEX "ProClueUserDay_brandId_customerUserId_idx" ON "ProClueUserDay"("brandId", "customerUserId");
