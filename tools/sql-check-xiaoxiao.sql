-- 所有昵称含"肖肖"的用户及其品牌挂载
SELECT u.id, u.phone, u.nickname, u."createdAt",
       string_agg(bm."brandId"::text || ':' || b.name || ':' || bm."roleKey", ' | ') AS brands
FROM "User" u
LEFT JOIN "BrandMember" bm ON bm."userId" = u.id
LEFT JOIN "Brand" b ON b.id = bm."brandId"
WHERE u.nickname LIKE '%肖肖%'
GROUP BY u.id, u.phone, u.nickname, u."createdAt" ORDER BY u.id;

-- 当前所有同时挂 brand4 + brand7 的双挂用户
SELECT u.id, u.phone, u.nickname,
       string_agg(bm."brandId"::text || ':' || b.name, ' | ') AS brands
FROM "User" u
JOIN "BrandMember" bm ON bm."userId" = u.id
JOIN "Brand" b ON b.id = bm."brandId"
WHERE bm."brandId" IN (4, 7)
GROUP BY u.id, u.phone, u.nickname
HAVING count(DISTINCT bm."brandId") = 2
ORDER BY u.id;

-- 奕境(7)当前成员数与构成
SELECT bm."roleKey", count(*) FROM "BrandMember" bm WHERE bm."brandId" = 7 GROUP BY 1;
SELECT count(*) AS brand7_distinct FROM "BrandMember" WHERE "brandId" = 7;
