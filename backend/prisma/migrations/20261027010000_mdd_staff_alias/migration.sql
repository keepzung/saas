-- MDD(5) 销售顾问→门店 人工别名表（无矩阵号顾问的门店归属补充；优先级高于昵称后缀/使用人匹配）
CREATE TABLE "MddStaffAlias" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL DEFAULT 5,
    "staff" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MddStaffAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MddStaffAlias_brandId_staff_key" ON "MddStaffAlias"("brandId", "staff");
