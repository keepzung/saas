-- 来鼓评论（专业号 KOS 评论流）+ 来鼓网关配置（多租户）
CREATE TABLE "LaiguComment" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 6,
    "commentId" TEXT NOT NULL,
    "noteId" TEXT,
    "noteTitle" TEXT,
    "noteCover" TEXT,
    "content" TEXT,
    "commentUserName" TEXT,
    "entOpenName" TEXT,
    "entOpenId" TEXT,
    "replyState" INTEGER NOT NULL DEFAULT 0,
    "isLocalReply" INTEGER,
    "createdAt" TIMESTAMP(3),
    "rawJson" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaiguComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LaiguComment_brandId_commentId_key" ON "LaiguComment"("brandId", "commentId");
CREATE INDEX "LaiguComment_brandId_createdAt_idx" ON "LaiguComment"("brandId", "createdAt");

CREATE TABLE "LaiguOrgConfig" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "gatewayToken" TEXT NOT NULL DEFAULT '',
    "agentId" TEXT,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api-gateway-ali.meiqia.cn',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastCommentSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaiguOrgConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LaiguOrgConfig_brandId_key" ON "LaiguOrgConfig"("brandId");
