-- 特斯拉旧看板项目导入快照列（旧系统周期累计指标无法按日聚合，原样保存）
ALTER TABLE "KoxCampaignProject" ADD COLUMN "importedStats" JSONB;
