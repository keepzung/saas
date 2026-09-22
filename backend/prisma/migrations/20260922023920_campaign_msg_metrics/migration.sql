-- AlterTable
ALTER TABLE "KoxCampaignDailyStat" ADD COLUMN     "messageConsult" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "msgChatUserCnt" INTEGER NOT NULL DEFAULT 0;

-- Backfill from rawJson (spark rtb payload carries messageConsult / msgChatUserCnt)
UPDATE "KoxCampaignDailyStat"
SET "messageConsult" = COALESCE(CAST("rawJson"->>'messageConsult' AS INTEGER), 0),
    "msgChatUserCnt" = COALESCE(CAST("rawJson"->>'msgChatUserCnt' AS INTEGER), 0)
WHERE "rawJson" IS NOT NULL;
