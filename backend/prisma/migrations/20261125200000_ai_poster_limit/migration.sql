-- AI 海报/场景生图：每用户每日次数上限（限额按工作区配置，许林等持 ai_poster_limit_set 权限者可调）
CREATE TABLE "AiPosterUsage" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiPosterUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiPosterUsage_userId_day_key" ON "AiPosterUsage"("userId", "day");
CREATE INDEX "AiPosterUsage_brandId_day_idx" ON "AiPosterUsage"("brandId", "day");

CREATE TABLE "AiPosterLimit" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "limitPerUser" INTEGER NOT NULL DEFAULT 20,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPosterLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiPosterLimit_brandId_key" ON "AiPosterLimit"("brandId");
