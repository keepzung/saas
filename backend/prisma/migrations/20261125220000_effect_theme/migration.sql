-- 特效配色（荧光块/霓虹光/金色渐变等颜色参数，按工作区配置）
CREATE TABLE "EffectTheme" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EffectTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EffectTheme_brandId_key" ON "EffectTheme"("brandId");
