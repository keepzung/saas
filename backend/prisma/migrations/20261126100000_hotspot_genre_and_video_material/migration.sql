-- 灵感引擎：内容方向分类（视频方向筛选）+ 视频任务指定素材/重点卖点
ALTER TABLE "HotContent" ADD COLUMN "videoGenre" TEXT;

CREATE INDEX "HotContent_brandId_videoGenre_idx" ON "HotContent"("brandId", "videoGenre");

ALTER TABLE "VideoGenTask" ADD COLUMN "materialVideoIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    ADD COLUMN "materialImageIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    ADD COLUMN "focusPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
