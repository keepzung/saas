-- CreateEnum
CREATE TYPE "ModuleType" AS ENUM ('category', 'group', 'feature');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "adminFlag" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "cktFlag" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "companyId" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nickname" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "adminFlag" INTEGER NOT NULL DEFAULT 0,
    "sourceConfig" TEXT NOT NULL DEFAULT 'marketine',
    "systemName" TEXT NOT NULL DEFAULT '智能商业营销系统',
    "systemDesc" TEXT NOT NULL DEFAULT '智能商业营销系统',
    "logoUrlFull" TEXT,
    "logoUrlLess" TEXT,
    "companyType" INTEGER NOT NULL DEFAULT 1,
    "userCompanyStatus" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandMember" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleNode" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "type" "ModuleType" NOT NULL,
    "path" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModuleNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_companyId_idx" ON "Brand"("companyId");

-- CreateIndex
CREATE INDEX "BrandMember_userId_idx" ON "BrandMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMember_brandId_userId_roleKey_key" ON "BrandMember"("brandId", "userId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleNode_key_key" ON "ModuleNode"("key");

-- CreateIndex
CREATE INDEX "ModuleNode_parentId_idx" ON "ModuleNode"("parentId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMember" ADD CONSTRAINT "BrandMember_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMember" ADD CONSTRAINT "BrandMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleNode" ADD CONSTRAINT "ModuleNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ModuleNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
