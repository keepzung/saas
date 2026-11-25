ALTER TABLE "WritingStrategy" ADD COLUMN "prompt" TEXT;
ALTER TABLE "WritingStrategy" ADD COLUMN "mode" VARCHAR(20) NOT NULL DEFAULT 'open';
ALTER TABLE "WritingStrategy" ADD COLUMN "formatText" TEXT;
ALTER TABLE "WritingStrategy" ADD COLUMN "requiredTags" JSONB;
ALTER TABLE "WritingStrategy" ADD COLUMN "forbiddenText" TEXT;
ALTER TABLE "WritingStrategy" ADD COLUMN "tone" JSONB;
ALTER TABLE "WritingStrategy" ADD COLUMN "visual" JSONB;
ALTER TABLE "WritingStrategy" ADD COLUMN "boundProductIds" JSONB;
