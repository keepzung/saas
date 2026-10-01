-- 聚光「标准投笔记报表」note×日（12 子账户加总口径）
CREATE TABLE "KoxJuguangNoteDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "noteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "vSeller" TEXT,
    "title" TEXT,
    "creator" TEXT,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impression" BIGINT NOT NULL DEFAULT 0,
    "click" BIGINT NOT NULL DEFAULT 0,
    "interaction" BIGINT NOT NULL DEFAULT 0,
    "msgInquiries" BIGINT NOT NULL DEFAULT 0,
    "msgOpenings" BIGINT NOT NULL DEFAULT 0,
    "msgLeads" BIGINT NOT NULL DEFAULT 0,
    "grassUser" BIGINT NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KoxJuguangNoteDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KoxJuguangNoteDaily_brandId_noteId_day_key" ON "KoxJuguangNoteDaily"("brandId", "noteId", "day");
CREATE INDEX "KoxJuguangNoteDaily_brandId_day_idx" ON "KoxJuguangNoteDaily"("brandId", "day");
