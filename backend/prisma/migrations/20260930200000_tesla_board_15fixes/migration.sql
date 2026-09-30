-- 特斯拉看板 15 项修改：pro 三档窗口 + partner 周/月消耗口径
-- 1) ProKosOverview / ProKosStaff 唯一约束加 dateType（同一 statDate 可存 近1日/近7日/近30日 三档快照）
DROP INDEX "ProKosOverview_brandId_statDate_key";
CREATE UNIQUE INDEX "ProKosOverview_brandId_statDate_dateType_key" ON "ProKosOverview"("brandId", "statDate", "dateType");

ALTER TABLE "ProKosStaff" ADD COLUMN "dateType" INTEGER NOT NULL DEFAULT 2;
DROP INDEX "ProKosStaff_brandId_userId_statDate_key";
CREATE UNIQUE INDEX "ProKosStaff_brandId_userId_statDate_dateType_key" ON "ProKosStaff"("brandId", "userId", "statDate", "dateType");

-- 2) SparkAccount 增 partner 盯盘 周/月消耗快照列
ALTER TABLE "SparkAccount" ADD COLUMN "weekCost" DECIMAL(14,2);
ALTER TABLE "SparkAccount" ADD COLUMN "monthCost" DECIMAL(14,2);
ALTER TABLE "SparkAccount" ADD COLUMN "partnerSnapshotAt" TIMESTAMP(3);
