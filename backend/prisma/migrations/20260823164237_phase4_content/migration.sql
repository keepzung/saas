-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "configType" TEXT NOT NULL DEFAULT 'product',
    "description" TEXT,
    "knowledge" TEXT,
    "salesPolicy" TEXT,
    "faq" TEXT,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPackage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL DEFAULT 'pro',
    "productId" INTEGER,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "reviewMode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageMaterial" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentForm" TEXT NOT NULL DEFAULT 'image_text',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "conversationId" TEXT,
    "reviewComment" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchTask" (
    "id" SERIAL NOT NULL,
    "taskName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "productId" INTEGER,
    "targetQty" INTEGER NOT NULL DEFAULT 1,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'random',
    "packageId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_parentId_idx" ON "Product"("parentId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "ContentPackage_productId_idx" ON "ContentPackage"("productId");

-- CreateIndex
CREATE INDEX "ContentPackage_brandId_idx" ON "ContentPackage"("brandId");

-- CreateIndex
CREATE INDEX "ContentPackage_status_idx" ON "ContentPackage"("status");

-- CreateIndex
CREATE INDEX "PackageMaterial_packageId_idx" ON "PackageMaterial"("packageId");

-- CreateIndex
CREATE INDEX "PackageMaterial_status_idx" ON "PackageMaterial"("status");

-- CreateIndex
CREATE INDEX "BatchTask_status_idx" ON "BatchTask"("status");

-- CreateIndex
CREATE INDEX "BatchTask_productId_idx" ON "BatchTask"("productId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPackage" ADD CONSTRAINT "ContentPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageMaterial" ADD CONSTRAINT "PackageMaterial_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTask" ADD CONSTRAINT "BatchTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
