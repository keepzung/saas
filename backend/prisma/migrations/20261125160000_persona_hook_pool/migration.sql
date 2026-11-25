-- 人设/钩子资源池（AIGC 内容工厂操作文档 2.1：策略级变量，写作时由用户从池中选择填入占位符）
CREATE TABLE "WritingPersona" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingPersona_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WritingHook" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 7,
    "text" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'any',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingHook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WritingPersona_brandId_idx" ON "WritingPersona"("brandId");
CREATE INDEX "WritingHook_brandId_idx" ON "WritingHook"("brandId");
