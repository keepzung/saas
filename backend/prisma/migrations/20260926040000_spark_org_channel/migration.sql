-- 双通道支持：mcc（星火组织）/ partner（商业化合作伙伴平台，代理商子账户投放）
ALTER TABLE "SparkOrgConfig" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'mcc';
ALTER TABLE "SparkOrgConfig" ADD COLUMN "excludeKeywords" TEXT;
