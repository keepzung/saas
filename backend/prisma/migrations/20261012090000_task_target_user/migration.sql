-- 任务派发目标支持"指定员工"：ContentTaskTarget 增加 userId，accountId 改为可选
ALTER TABLE "ContentTaskTarget" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "ContentTaskTarget" ADD COLUMN "userId" INTEGER;

CREATE INDEX "ContentTaskTarget_userId_idx" ON "ContentTaskTarget"("userId");
CREATE UNIQUE INDEX "ContentTaskTarget_taskId_userId_key" ON "ContentTaskTarget"("taskId", "userId");

ALTER TABLE "ContentTaskTarget" ADD CONSTRAINT "ContentTaskTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
