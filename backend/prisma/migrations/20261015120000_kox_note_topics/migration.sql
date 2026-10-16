-- 笔记话题标签（来自 MCC huati_tag_list，逗号分隔→数组）
ALTER TABLE "KoxNote" ADD COLUMN "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];
