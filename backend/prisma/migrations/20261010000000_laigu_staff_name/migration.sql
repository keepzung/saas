-- 来鼓私信归属员工（特斯拉 210 账号过滤：反馈分析 brand6 仅显示基线账号员工的会话）
ALTER TABLE "LaiguLead" ADD COLUMN "staffName" TEXT;

CREATE INDEX "LaiguLead_brandId_staffName_idx" ON "LaiguLead"("brandId", "staffName");
