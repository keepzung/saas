-- 灵感引擎：跨平台热点/竞品/拆解/视频生成/达人匹配
-- KolCreator: authorId 单列唯一 → (platform, authorId) 复合唯一，支持跨平台达人库

-- 1. 清理跨平台唯一键下的重复达人（保留 id 最小的一行）
DELETE FROM "KolCreator"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "platform", "authorId" ORDER BY "id" ASC) AS rn
    FROM "KolCreator"
  ) t
  WHERE t.rn > 1
);

-- 2. 切换唯一约束
DROP INDEX IF EXISTS "KolCreator_authorId_key";
ALTER TABLE "KolCreator" ADD COLUMN "goodsCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "KolCreator" ADD COLUMN "hotHits" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "KolCreator_platform_authorId_key" ON "KolCreator"("platform", "authorId");

-- 3. 跨平台登录态
CREATE TABLE "PlatformSession" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '默认',
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "storageState" JSONB,
    "cookie" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformSession_platform_label_key" ON "PlatformSession"("platform", "label");

-- 4. 抓取关键词配置
CREATE TABLE "HotspotKeyword" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "keyword" TEXT NOT NULL,
    "platforms" TEXT[] DEFAULT ARRAY['xhs', 'bilibili']::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotspotKeyword_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HotspotKeyword_brandId_keyword_key" ON "HotspotKeyword"("brandId", "keyword");
CREATE INDEX "HotspotKeyword_brandId_enabled_idx" ON "HotspotKeyword"("brandId", "enabled");

-- 5. 跨平台内容池
CREATE TABLE "HotContent" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT,
    "coverUrl" TEXT,
    "videoUrl" TEXT,
    "durationSec" INTEGER,
    "authorId" TEXT NOT NULL DEFAULT '',
    "authorName" TEXT NOT NULL DEFAULT '',
    "authorAvatar" TEXT,
    "authorFans" INTEGER,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishTime" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "collectCount" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL DEFAULT 'search',
    "sourceKeyword" TEXT,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "breakdownStatus" TEXT NOT NULL DEFAULT 'none',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB,

    CONSTRAINT "HotContent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HotContent_platform_contentId_key" ON "HotContent"("platform", "contentId");
CREATE INDEX "HotContent_brandId_sourceType_idx" ON "HotContent"("brandId", "sourceType");
CREATE INDEX "HotContent_platform_sourceType_scrapedAt_idx" ON "HotContent"("platform", "sourceType", "scrapedAt");

-- 6. 竞品账号
CREATE TABLE "CompetitorAccount" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT,
    "homeUrl" TEXT,
    "alias" TEXT,
    "note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompetitorAccount_brandId_platform_authorId_key" ON "CompetitorAccount"("brandId", "platform", "authorId");
CREATE INDEX "CompetitorAccount_brandId_idx" ON "CompetitorAccount"("brandId");

-- 7. 爆款拆解
CREATE TABLE "ContentBreakdown" (
    "id" SERIAL NOT NULL,
    "hotContentId" INTEGER NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "hook" TEXT,
    "structure" JSONB,
    "sellingPoints" JSONB,
    "cta" TEXT,
    "styleTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scriptText" TEXT,
    "replicateTips" TEXT,
    "aiModel" TEXT,
    "rawAnalysis" JSONB,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBreakdown_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentBreakdown_hotContentId_key" ON "ContentBreakdown"("hotContentId");
CREATE INDEX "ContentBreakdown_brandId_status_idx" ON "ContentBreakdown"("brandId", "status");
ALTER TABLE "ContentBreakdown" ADD CONSTRAINT "ContentBreakdown_hotContentId_fkey" FOREIGN KEY ("hotContentId") REFERENCES "HotContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. 品牌自有视频素材
CREATE TABLE "MaterialVideo" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "durationSec" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productNodeId" INTEGER,
    "setId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaterialVideo_brandId_idx" ON "MaterialVideo"("brandId");

-- 9. 视频生成任务
CREATE TABLE "VideoGenTask" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "breakdownId" INTEGER,
    "hotContentId" INTEGER,
    "productId" INTEGER NOT NULL,
    "title" TEXT,
    "script" JSONB,
    "engine" TEXT NOT NULL DEFAULT 'mixcut',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "audioUrl" TEXT,
    "videoUrl" TEXT,
    "coverUrl" TEXT,
    "durationSec" INTEGER,
    "errorMsg" TEXT,
    "historyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoGenTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VideoGenTask_brandId_status_idx" ON "VideoGenTask"("brandId", "status");
ALTER TABLE "VideoGenTask" ADD CONSTRAINT "VideoGenTask_breakdownId_fkey" FOREIGN KEY ("breakdownId") REFERENCES "ContentBreakdown"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 10. 产品↔达人匹配
CREATE TABLE "KolMatch" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "productId" INTEGER NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "score" INTEGER,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KolMatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KolMatch_productId_creatorId_key" ON "KolMatch"("productId", "creatorId");
CREATE INDEX "KolMatch_brandId_status_idx" ON "KolMatch"("brandId", "status");
ALTER TABLE "KolMatch" ADD CONSTRAINT "KolMatch_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "KolCreator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
