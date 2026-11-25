-- 素材包复制语义：副本记录其底稿来源（移入=复制留底稿，移出=删副本）
ALTER TABLE "XhsHistory" ADD COLUMN "copiedFromId" INTEGER;
