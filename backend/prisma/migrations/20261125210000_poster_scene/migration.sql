-- AI 海报自定义场景预设（有管理权限者增删）
CREATE TABLE "PosterScene" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 99,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosterScene_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosterScene_brandId_idx" ON "PosterScene"("brandId");
