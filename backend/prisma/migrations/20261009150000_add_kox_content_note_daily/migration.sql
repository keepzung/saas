-- 聚光「商业内容管理」逐笔记×逐日（窗口内发布的员工笔记；区域数据分析内容指标权威源）
CREATE TABLE "KoxContentNoteDaily" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "noteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "impNum" INTEGER NOT NULL DEFAULT 0,
    "readFeedNum" INTEGER NOT NULL DEFAULT 0,
    "engageCnt" INTEGER NOT NULL DEFAULT 0,
    "followCnt" INTEGER NOT NULL DEFAULT 0,
    "authorName" TEXT,
    "vSellerId" TEXT,
    "notePublishTime" TIMESTAMP(3),
    "isRtbAdver" BOOLEAN,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoxContentNoteDaily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KoxContentNoteDaily_brandId_day_idx" ON "KoxContentNoteDaily"("brandId", "day");

CREATE INDEX "KoxContentNoteDaily_brandId_notePublishTime_idx" ON "KoxContentNoteDaily"("brandId", "notePublishTime");

CREATE UNIQUE INDEX "KoxContentNoteDaily_brandId_noteId_day_key" ON "KoxContentNoteDaily"("brandId", "noteId", "day");
