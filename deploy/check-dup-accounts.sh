#!/bin/bash
# 检查账号重基是否产生重复（同昵称 enabled/disabled 并存）
sudo -u postgres psql saas_prod -Atc "SELECT count(*) FROM \"KosAccount\" WHERE \"brandId\"=6;"
sudo -u postgres psql saas_prod -Atc "SELECT count(*) FROM \"KosAccount\" WHERE \"brandId\"=6 AND status='enabled';"
sudo -u postgres psql saas_prod -Atc "SELECT count(*) FROM \"KosAccount\" WHERE \"brandId\"=6 AND status='disabled';"
echo '--- 同昵称并存样例 ---'
sudo -u postgres psql saas_prod -Atc "SELECT e.nickname, e.\"authorId\" AS enabled_uid, d.\"authorId\" AS disabled_uid FROM \"KosAccount\" e JOIN \"KosAccount\" d ON e.nickname=d.nickname AND e.status='enabled' AND d.status='disabled' AND e.\"brandId\"=6 AND d.\"brandId\"=6 LIMIT 5;"
echo '---萧山账号---'
sudo -u postgres psql saas_prod -Atc "SELECT id, \"authorId\", nickname, fans, status FROM \"KosAccount\" WHERE \"brandId\"=6 AND nickname LIKE '%萧山%' LIMIT 5;"
