-- MDD(5) 小红书渠道销售清单（月度 × 门店 × 品系；Excel 导入 upsert）
CREATE TABLE "MddChannelSale" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "month" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "province" TEXT,
    "productLine" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MddChannelSale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MddChannelSale_brandId_month_storeName_productLine_key" ON "MddChannelSale"("brandId", "month", "storeName", "productLine");
CREATE INDEX "MddChannelSale_brandId_month_idx" ON "MddChannelSale"("brandId", "month");
CREATE INDEX "MddChannelSale_brandId_productLine_idx" ON "MddChannelSale"("brandId", "productLine");
