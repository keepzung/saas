SELECT bm."brandId", b.name, count(*)
FROM "BrandMember" bm
JOIN "User" u ON u.id = bm."userId"
JOIN "Brand" b ON b.id = bm."brandId"
WHERE u."createdAt" BETWEEN '2026-10-04 17:20:00' AND '2026-10-04 17:30:00'
GROUP BY 1, 2 ORDER BY 1;
SELECT count(*) AS brand7_distinct FROM "BrandMember" WHERE "brandId" = 7;
