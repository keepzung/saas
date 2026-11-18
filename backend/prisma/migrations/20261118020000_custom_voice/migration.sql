-- 我的音色：用户录音 → 火山引擎声音复刻训练 → 专属 TTS 音色
CREATE TABLE "CustomVoice" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 1,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "voiceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'training',
    "sampleUrl" TEXT,
    "durationSec" INTEGER,
    "errorMsg" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomVoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomVoice_brandId_status_idx" ON "CustomVoice"("brandId", "status");

-- 菜单：挂在「灵感引擎」分组下（用 /hotspot/studio 的父节点定位，不依赖分组名）
INSERT INTO "ModuleNode" ("key", "name", "icon", "type", "path", "parentId", "sort", "visible")
SELECT 'hotspot_g_f_voices', '我的音色', NULL, 'feature', '/hotspot/voices', p."parentId", 99, true
FROM "ModuleNode" p
WHERE p."path" = '/hotspot/studio'
  AND NOT EXISTS (
    SELECT 1 FROM "ModuleNode" n WHERE n."path" = '/hotspot/voices' OR n."key" = 'hotspot_g_f_voices'
  );
