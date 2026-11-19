-- 热点池品牌隔离：搜索/热门feed 抓取的内容归属抓取工作区，不再跨品牌共享（避免素材混品牌）
UPDATE "HotContent" SET "isPublic" = false WHERE "sourceType" IN ('search', 'hot_list');
