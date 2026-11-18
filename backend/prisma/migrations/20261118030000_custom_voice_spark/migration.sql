-- 我的音色切换到 spark-hub 平台：区分「平台同步的复刻音色」与「本地上传的待训练样音」
ALTER TABLE "CustomVoice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE "CustomVoice" ADD COLUMN "previewUrl" TEXT;
