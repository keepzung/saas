-- CreateTable
CREATE TABLE "KoxCampaignProject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budget" DECIMAL(14,2),
    "remark" TEXT,
    "brandId" INTEGER NOT NULL DEFAULT 2,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoxCampaignProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoxCampaignProjectAccount" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "virtualSellerId" TEXT NOT NULL,

    CONSTRAINT "KoxCampaignProjectAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KoxCampaignProject_brandId_idx" ON "KoxCampaignProject"("brandId");

-- CreateIndex
CREATE INDEX "KoxCampaignProjectAccount_virtualSellerId_idx" ON "KoxCampaignProjectAccount"("virtualSellerId");

-- CreateIndex
CREATE UNIQUE INDEX "KoxCampaignProjectAccount_projectId_virtualSellerId_key" ON "KoxCampaignProjectAccount"("projectId", "virtualSellerId");

-- AddForeignKey
ALTER TABLE "KoxCampaignProject" ADD CONSTRAINT "KoxCampaignProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoxCampaignProjectAccount" ADD CONSTRAINT "KoxCampaignProjectAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KoxCampaignProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
