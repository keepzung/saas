-- CreateTable
CREATE TABLE "LaiguLead" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "sessionId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "phone" TEXT,
    "isResource" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "subSource" TEXT,
    "chatEntry" TEXT,
    "ipLocation" TEXT,
    "clientAttrs" JSONB,
    "adInfo" JSONB,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "clientMessageCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastClientContent" TEXT,
    "sessionCreatedAt" TIMESTAMP(3),
    "sessionEndedAt" TIMESTAMP(3),
    "rawJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaiguLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaiguLead_sessionId_key" ON "LaiguLead"("sessionId");

-- CreateIndex
CREATE INDEX "LaiguLead_brandId_idx" ON "LaiguLead"("brandId");

-- CreateIndex
CREATE INDEX "LaiguLead_brandId_sessionEndedAt_idx" ON "LaiguLead"("brandId", "sessionEndedAt");

-- CreateIndex
CREATE INDEX "LaiguLead_phone_idx" ON "LaiguLead"("phone");
