-- H5 扫码接力 + 任务产出归属：XhsHistory 关联内容创作任务（status: 0=草稿 1=已发布）
ALTER TABLE "XhsHistory" ADD COLUMN "contentTaskId" INTEGER;
CREATE INDEX "XhsHistory_contentTaskId_idx" ON "XhsHistory"("contentTaskId");
ALTER TABLE "XhsHistory" ADD CONSTRAINT "XhsHistory_contentTaskId_fkey" FOREIGN KEY ("contentTaskId") REFERENCES "ContentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
