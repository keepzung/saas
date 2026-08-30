-- CreateTable
CREATE TABLE "KolCreator" (
    "id" SERIAL NOT NULL,
    "authorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'xhs',
    "platformId" INTEGER NOT NULL DEFAULT 1,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "cover" TEXT,
    "gender" TEXT,
    "location" TEXT,
    "fans" INTEGER NOT NULL DEFAULT 0,
    "mcn" TEXT,
    "noteSign" TEXT,
    "category" TEXT,
    "persona" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recentBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noteCount" INTEGER NOT NULL DEFAULT 0,
    "exposureMedian" INTEGER NOT NULL DEFAULT 0,
    "readMedian" INTEGER NOT NULL DEFAULT 0,
    "interactionMedian" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "picturePrice" DECIMAL(10,2),
    "videoPrice" DECIMAL(10,2),
    "pictureState" TEXT,
    "videoState" TEXT,
    "cooperationForm" TEXT,
    "homePage" TEXT,
    "inLibrary" BOOLEAN NOT NULL DEFAULT false,
    "contactStatus" TEXT NOT NULL DEFAULT 'pending',
    "contactPhone" TEXT,
    "contactWechat" TEXT,
    "contactMail" TEXT,
    "remark" TEXT,
    "resourceStatus" INTEGER NOT NULL DEFAULT 1,
    "ownerId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KolCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolReview" (
    "id" SERIAL NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "operatorId" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KolReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolLog" (
    "id" SERIAL NOT NULL,
    "actionType" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "operatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KolLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KolCreator_authorId_key" ON "KolCreator"("authorId");

-- CreateIndex
CREATE INDEX "KolCreator_inLibrary_idx" ON "KolCreator"("inLibrary");

-- CreateIndex
CREATE INDEX "KolCreator_mcn_idx" ON "KolCreator"("mcn");

-- CreateIndex
CREATE INDEX "KolCreator_fans_idx" ON "KolCreator"("fans");

-- CreateIndex
CREATE INDEX "KolCreator_ownerId_idx" ON "KolCreator"("ownerId");

-- CreateIndex
CREATE INDEX "KolCreator_contactStatus_idx" ON "KolCreator"("contactStatus");

-- CreateIndex
CREATE INDEX "KolReview_status_idx" ON "KolReview"("status");

-- CreateIndex
CREATE INDEX "KolReview_creatorId_idx" ON "KolReview"("creatorId");

-- CreateIndex
CREATE INDEX "KolLog_actionType_idx" ON "KolLog"("actionType");

-- CreateIndex
CREATE INDEX "KolLog_operatedAt_idx" ON "KolLog"("operatedAt");

-- AddForeignKey
ALTER TABLE "KolCreator" ADD CONSTRAINT "KolCreator_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolCreator" ADD CONSTRAINT "KolCreator_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolReview" ADD CONSTRAINT "KolReview_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "KolCreator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolReview" ADD CONSTRAINT "KolReview_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolLog" ADD CONSTRAINT "KolLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
