#!/bin/bash
# 只读检查：juguang 同步结果 + KoxNote 状态
sudo -u postgres psql saas_prod -Atc 'SELECT id, "syncType", "statDate"::date, fetched, upserted FROM "SparkSyncLog" WHERE "brandId"=6 AND "syncType"='"'"'juguang_note'"'"' ORDER BY id DESC LIMIT 3;'
sudo -u postgres psql saas_prod -Atc 'SELECT count(*) FILTER (WHERE "rawJson"->'"'"'juguang_agg'"'"' IS NOT NULL) juguang_notes, count(*) FILTER (WHERE title LIKE '"'"'(%'"'"') placeholder_titles, count(*) FILTER (WHERE "authorName" IS NOT NULL) with_author FROM "KoxNote" WHERE "brandId"=6;'
