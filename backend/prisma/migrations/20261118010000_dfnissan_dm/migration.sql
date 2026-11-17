-- 智能私信一期：消息规范化 / 意图打标 / SLA 计时 / DM 配置 / 回复日志 / 按品牌 OpenAPI 凭据
ALTER TABLE "LaiguOrgConfig" ADD COLUMN "apiKey" TEXT;
ALTER TABLE "LaiguOrgConfig" ADD COLUMN "apiSecret" TEXT;
ALTER TABLE "LaiguOrgConfig" ADD COLUMN "apiBaseUrl" TEXT;

ALTER TABLE "LaiguLead" ADD COLUMN "intentLevel" TEXT;
ALTER TABLE "LaiguLead" ADD COLUMN "intentTags" JSONB;
ALTER TABLE "LaiguLead" ADD COLUMN "intentAt" TIMESTAMP(3);
ALTER TABLE "LaiguLead" ADD COLUMN "firstClientAt" TIMESTAMP(3);
ALTER TABLE "LaiguLead" ADD COLUMN "firstReplyAt" TIMESTAMP(3);
ALTER TABLE "LaiguLead" ADD COLUMN "replyBy" TEXT;
ALTER TABLE "LaiguLead" ADD COLUMN "autoRepliedAt" TIMESTAMP(3);
ALTER TABLE "LaiguLead" ADD COLUMN "humanTakenOver" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "LaiguLead_brandId_intentLevel_idx" ON "LaiguLead"("brandId", "intentLevel");

-- 规范化消息表（rawJson 增量提取）
CREATE TABLE "LaiguMessage" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "sessionId" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'client',
    "senderName" TEXT,
    "contentType" TEXT,
    "content" TEXT,
    "contentText" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaiguMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LaiguMessage_sessionId_msgId_key" ON "LaiguMessage"("sessionId", "msgId");
CREATE INDEX "LaiguMessage_sessionId_sentAt_idx" ON "LaiguMessage"("sessionId", "sentAt");
CREATE INDEX "LaiguMessage_brandId_sentAt_idx" ON "LaiguMessage"("brandId", "sentAt");

-- 智能私信工作区配置
CREATE TABLE "DmConfig" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "slaMinutes" INTEGER NOT NULL DEFAULT 3,
    "contextTurns" INTEGER NOT NULL DEFAULT 10,
    "personaTemplateId" INTEGER,
    "personaOverrides" JSONB,
    "notifyWecom" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DmConfig_brandId_key" ON "DmConfig"("brandId");

-- bot 回复决策日志
CREATE TABLE "DmReplyLog" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "triggerMsgAt" TIMESTAMP(3),
    "draft" TEXT NOT NULL,
    "finalContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dry_run',
    "intent" TEXT,
    "leadLevel" TEXT,
    "ruleHits" JSONB,
    "aiMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmReplyLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DmReplyLog_brandId_createdAt_idx" ON "DmReplyLog"("brandId", "createdAt");
CREATE INDEX "DmReplyLog_sessionId_createdAt_idx" ON "DmReplyLog"("sessionId", "createdAt");
