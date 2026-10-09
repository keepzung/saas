-- Morgandada(5) 来鼓私信过滤：advertiserName 打标 + isMdd 判定（并集：投放账户 / 小红书账号id / 客服昵称）
-- 特斯拉系等其它品牌的会话保留在库但页面不可见（查询默认 isMdd=true）
ALTER TABLE "LaiguLead" ADD COLUMN "advertiserName" TEXT;
ALTER TABLE "LaiguLead" ADD COLUMN "isMdd" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LaiguLead_brandId_isMdd_idx" ON "LaiguLead"("brandId", "isMdd");

UPDATE "LaiguLead" SET "advertiserName" = "adInfo"->>'advertiser_name'
WHERE "adInfo"->>'advertiser_name' IS NOT NULL;

UPDATE "LaiguLead" l SET "isMdd" = true
WHERE l."brandId" = 5 AND (
  l."adInfo"->>'advertiser_name' = 'Morgan DaDa-种草'
  OR (l."subSource" IS NOT NULL AND l."subSource" IN (
    SELECT substring(a."authorUrl" FROM '/profile/([0-9a-f]+)$')
    FROM "KosAccount" a
    WHERE a."brandId" = 5 AND a."authorUrl" LIKE '%/profile/%'
  ))
  OR (l."staffName" IS NOT NULL AND l."staffName" IN (
    SELECT a."nickname" FROM "KosAccount" a WHERE a."brandId" = 5
  ))
);
