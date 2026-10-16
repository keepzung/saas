CREATE TABLE "KosRosterEntry" (
    id SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "rowType" TEXT NOT NULL,
    "sqCode" TEXT,
    "region" TEXT,
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "storeName" TEXT,
    "mainUid" TEXT,
    "mainName" TEXT,
    "staffUid" TEXT,
    "staffName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KosRosterEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KosRosterEntry_brandId_rowType_idx" ON "KosRosterEntry"("brandId", "rowType");
