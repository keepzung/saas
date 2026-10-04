-- 4级账号体系：工作区(brand) → 组织(BrandOrg: 大区/经销商/门店) → KOS 员工(User.orgId ↔ KosAccount.userId)
-- CreateTable
CREATE TABLE "BrandOrg" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 3,
    "parentId" INTEGER,
    "regionName" TEXT,
    "cityName" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandOrg_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BrandOrg_brandId_idx" ON "BrandOrg"("brandId");
CREATE INDEX "BrandOrg_parentId_idx" ON "BrandOrg"("parentId");
ALTER TABLE "BrandOrg" ADD CONSTRAINT "BrandOrg_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BrandOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User.orgId（L3/L4 组织归属）
ALTER TABLE "User" ADD COLUMN "orgId" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "BrandOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- KosAccount.userId（KOS 账号 ↔ 登录身份 1:1）
ALTER TABLE "KosAccount" ADD COLUMN "userId" INTEGER;
ALTER TABLE "KosAccount" ADD CONSTRAINT "KosAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "KosAccount_userId_key" ON "KosAccount"("userId");
