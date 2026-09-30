-- 特斯拉周度快照（客户周度表权威口径）
CREATE TABLE "KoxWeeklySnapshot" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "accountId" INTEGER,
    "uid" TEXT,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT,
    "regionName" TEXT,
    "storeName" TEXT,
    "tierLabel" TEXT,
    "certifyUser" TEXT,
    "publishNotes" INTEGER NOT NULL DEFAULT 0,
    "promotedNotes" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interaction" INTEGER NOT NULL DEFAULT 0,
    "exposure" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "inquiries" INTEGER NOT NULL DEFAULT 0,
    "openings" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "pmLeads" INTEGER NOT NULL DEFAULT 0,
    "serviceCardLeads" INTEGER NOT NULL DEFAULT 0,
    "appointmentLeads" INTEGER NOT NULL DEFAULT 0,
    "wecomCopyLeads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KoxWeeklySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KoxWeeklySnapshot_brandId_weekStart_accountName_key" ON "KoxWeeklySnapshot"("brandId", "weekStart", "accountName");
CREATE INDEX "KoxWeeklySnapshot_brandId_weekStart_weekEnd_idx" ON "KoxWeeklySnapshot"("brandId", "weekStart", "weekEnd");
