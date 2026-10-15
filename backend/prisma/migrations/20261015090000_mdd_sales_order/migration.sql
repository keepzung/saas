-- MDD(5) 小红书渠道销售订单明细（订单级，含客户手机号/销售顾问/门店归属）
CREATE TABLE "MddSalesOrder" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "month" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "orderSeq" TEXT,
    "internalNo" TEXT,
    "customerName" TEXT,
    "phone" TEXT,
    "repurchase" TEXT,
    "channel" TEXT,
    "productModel" TEXT,
    "productName" TEXT,
    "color" TEXT,
    "size" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2),
    "discountSub" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "staff" TEXT,
    "storeName" TEXT,
    "remark" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MddSalesOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MddSalesOrder_dedupKey_key" ON "MddSalesOrder"("dedupKey");
CREATE INDEX "MddSalesOrder_brandId_month_idx" ON "MddSalesOrder"("brandId", "month");
CREATE INDEX "MddSalesOrder_brandId_storeName_idx" ON "MddSalesOrder"("brandId", "storeName");
CREATE INDEX "MddSalesOrder_brandId_staff_idx" ON "MddSalesOrder"("brandId", "staff");
CREATE INDEX "MddSalesOrder_phone_idx" ON "MddSalesOrder"("phone");