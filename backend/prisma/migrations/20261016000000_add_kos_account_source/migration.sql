-- account source marker: roster=client sheet / auto=spark sync auto-register / legacy=old list
ALTER TABLE "KosAccount" ADD COLUMN "source" TEXT;
