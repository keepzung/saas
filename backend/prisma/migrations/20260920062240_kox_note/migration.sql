-- CreateTable
CREATE TABLE "KoxNote" (
    "id" SERIAL NOT NULL,
    "noteId" TEXT NOT NULL,
    "accountId" INTEGER,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "coverUrl" TEXT,
    "noteUrl" TEXT,
    "noteType" TEXT NOT NULL DEFAULT 'normal',
    "publishTime" TIMESTAMP(3),
    "exposure" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "collects" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "followCount" INTEGER NOT NULL DEFAULT 0,
    "pmInquiries" INTEGER NOT NULL DEFAULT 0,
    "pmOpenings" INTEGER NOT NULL DEFAULT 0,
    "pmLeads" INTEGER NOT NULL DEFAULT 0,
    "formLeads" INTEGER NOT NULL DEFAULT 0,
    "authorName" TEXT,
    "accountType" TEXT,
    "category" TEXT,
    "modelTag" TEXT,
    "keyword" TEXT,
    "statDate" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoxNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KoxNote_noteId_key" ON "KoxNote"("noteId");

-- CreateIndex
CREATE INDEX "KoxNote_brandId_publishTime_idx" ON "KoxNote"("brandId", "publishTime");

-- CreateIndex
CREATE INDEX "KoxNote_accountId_idx" ON "KoxNote"("accountId");

-- CreateIndex
CREATE INDEX "KoxNote_noteType_idx" ON "KoxNote"("noteType");

-- AddForeignKey
ALTER TABLE "KoxNote" ADD CONSTRAINT "KoxNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "KosAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
