-- AlterTable
ALTER TABLE "KoxNote" ADD COLUMN "brandUserName" TEXT;

-- Backfill from rawJson
UPDATE "KoxNote"
SET "brandUserName" = "rawJson"->>'brand_user_name'
WHERE "rawJson" IS NOT NULL AND "rawJson"->>'brand_user_name' IS NOT NULL;
