-- 任务话题标签与创作要求
ALTER TABLE "ContentTask" ADD COLUMN "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ContentTask" ADD COLUMN "requireMinWords" INTEGER;
ALTER TABLE "ContentTask" ADD COLUMN "requireMinImages" INTEGER;
