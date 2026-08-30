-- CreateTable
CREATE TABLE "ProjectFolder" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "description" TEXT,
    "folderId" INTEGER,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "productId" INTEGER,
    "budgetTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serviceFeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxFeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "phase" TEXT NOT NULL DEFAULT 'planning',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "ownerId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStats" (
    "projectId" INTEGER NOT NULL,
    "deliverableCount" INTEGER NOT NULL DEFAULT 0,
    "plannedQuantity" INTEGER NOT NULL DEFAULT 0,
    "completedQuantity" INTEGER NOT NULL DEFAULT 0,
    "plannedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "riskCount" INTEGER NOT NULL DEFAULT 0,
    "relationCount" INTEGER NOT NULL DEFAULT 0,
    "quoteDraftAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quoteCollaborationStatus" TEXT NOT NULL DEFAULT 'not_configured',
    "costCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "costExpectedCount" INTEGER NOT NULL DEFAULT 0,
    "sheetCount" INTEGER NOT NULL DEFAULT 0,
    "talentTotal" INTEGER NOT NULL DEFAULT 0,
    "formalCount" INTEGER NOT NULL DEFAULT 0,
    "backupCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "executionTotal" INTEGER NOT NULL DEFAULT 0,
    "readyToStart" INTEGER NOT NULL DEFAULT 0,
    "draftCount" INTEGER NOT NULL DEFAULT 0,
    "revisionRequired" INTEGER NOT NULL DEFAULT 0,
    "internalReview" INTEGER NOT NULL DEFAULT 0,
    "brandReview" INTEGER NOT NULL DEFAULT 0,
    "readyToPublish" INTEGER NOT NULL DEFAULT 0,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "overdueCount" INTEGER NOT NULL DEFAULT 0,
    "attentionLabel" TEXT NOT NULL DEFAULT '暂无待办',
    "attentionCreator" TEXT,
    "attentionLevel" TEXT NOT NULL DEFAULT 'none',

    CONSTRAINT "ProjectStats_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "ProjectFolder_brandId_idx" ON "ProjectFolder"("brandId");

-- CreateIndex
CREATE INDEX "ProjectFolder_parentId_idx" ON "ProjectFolder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE INDEX "Project_folderId_idx" ON "Project"("folderId");

-- CreateIndex
CREATE INDEX "Project_brandId_idx" ON "Project"("brandId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStats" ADD CONSTRAINT "ProjectStats_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
