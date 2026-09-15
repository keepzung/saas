-- AlterTable
ALTER TABLE "KosAccount" ADD COLUMN     "regionName" TEXT,
ADD COLUMN     "saleArea" TEXT;

-- CreateTable
CREATE TABLE "KoxAccountDailyStat" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "itemCnt" INTEGER NOT NULL DEFAULT 0,
    "crazyItemCnt" INTEGER NOT NULL DEFAULT 0,
    "exposureSum" INTEGER NOT NULL DEFAULT 0,
    "viewSum" INTEGER NOT NULL DEFAULT 0,
    "diggSum" INTEGER NOT NULL DEFAULT 0,
    "interactionSum" INTEGER NOT NULL DEFAULT 0,
    "followCountSum" INTEGER NOT NULL DEFAULT 0,
    "pmLeads" INTEGER NOT NULL DEFAULT 0,
    "toolClickCnt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoxAccountDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KoxAccountDailyStat_statDate_idx" ON "KoxAccountDailyStat"("statDate");

-- CreateIndex
CREATE INDEX "KoxAccountDailyStat_accountId_statDate_idx" ON "KoxAccountDailyStat"("accountId", "statDate");

-- CreateIndex
CREATE UNIQUE INDEX "KoxAccountDailyStat_accountId_statDate_key" ON "KoxAccountDailyStat"("accountId", "statDate");

-- CreateIndex
CREATE INDEX "KosAccount_regionName_idx" ON "KosAccount"("regionName");

-- CreateIndex
CREATE INDEX "KosAccount_saleArea_idx" ON "KosAccount"("saleArea");

-- CreateIndex
CREATE INDEX "KosAccount_storeName_idx" ON "KosAccount"("storeName");

-- AddForeignKey
ALTER TABLE "KoxAccountDailyStat" ADD CONSTRAINT "KoxAccountDailyStat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "KosAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
