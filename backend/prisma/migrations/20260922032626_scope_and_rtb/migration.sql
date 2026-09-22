-- AlterTable
ALTER TABLE "SparkAccount" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'dealer';
ALTER TABLE "KoxNote" ADD COLUMN     "isRtbAdver" BOOLEAN;

-- Heuristic pre-classification: HQ-run accounts (brand HQ / SAIC direct / HQ material accounts)
UPDATE "SparkAccount" SET "scope" = 'hq'
WHERE "name" = '荣威ROEWE'
   OR "name" LIKE 'MV_华东_上汽荣威%'
   OR "name" LIKE '上汽集团%'
   OR "name" LIKE '%乘用车分公司%'
   OR "name" LIKE '荣威-科莱%';

-- Backfill note promotion status from rawJson
UPDATE "KoxNote"
SET "isRtbAdver" = CASE WHEN "rawJson"->>'is_rtb_adver' IN ('1', 'true') THEN true ELSE false END
WHERE "rawJson" IS NOT NULL;

-- Index for scope-filtered aggregation
CREATE INDEX "KoxNote_isRtbAdver_idx" ON "KoxNote"("isRtbAdver");
