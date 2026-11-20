-- CreateTable
CREATE TABLE "GreeAdNoteDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 8,
    "day" TIMESTAMP(3) NOT NULL,
    "sellerName" TEXT,
    "sellerId" TEXT,
    "authorId" TEXT,
    "noteId" TEXT NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impression" INTEGER NOT NULL DEFAULT 0,
    "click" INTEGER NOT NULL DEFAULT 0,
    "interaction" INTEGER NOT NULL DEFAULT 0,
    "pmInquiries" INTEGER NOT NULL DEFAULT 0,
    "pmOpenings" INTEGER NOT NULL DEFAULT 0,
    "pmLeads" INTEGER NOT NULL DEFAULT 0,
    "pmOpenMsgs" INTEGER NOT NULL DEFAULT 0,
    "pmInqUsers" INTEGER NOT NULL DEFAULT 0,
    "resp15s" INTEGER NOT NULL DEFAULT 0,
    "reply30s" INTEGER NOT NULL DEFAULT 0,
    "reply1min" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'excel_推进表_20261120',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreeAdNoteDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GreeAdNoteDaily_brandId_day_idx" ON "GreeAdNoteDaily"("brandId", "day");

-- CreateIndex
CREATE INDEX "GreeAdNoteDaily_brandId_authorId_day_idx" ON "GreeAdNoteDaily"("brandId", "authorId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "GreeAdNoteDaily_brandId_noteId_day_key" ON "GreeAdNoteDaily"("brandId", "noteId", "day");

