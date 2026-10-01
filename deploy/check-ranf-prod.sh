#!/bin/bash
# ranf 同步状态诊断（只读）
echo "=== KoxRanfDaily ==="
sudo -u postgres psql saas_prod -Atc 'SELECT count(*), min(day)::date, max(day)::date FROM "KoxRanfDaily";'
echo "=== 09-20 之后分日 ==="
sudo -u postgres psql saas_prod -Atc "SELECT day::date, impression FROM \"KoxRanfDaily\" WHERE day >= '2026-09-20' ORDER BY day;"
echo "=== SparkSyncLog 最近 ==="
sudo -u postgres psql saas_prod -Atc "SELECT id, brand_id, sync_type, stat_date::date, left(message, 90) FROM \"SparkSyncLog\" ORDER BY id DESC LIMIT 8;"
echo "=== deploy crontab ==="
sudo -u deploy crontab -l 2>&1
echo "=== backend dist kox.service.js 含 ranf 补缺? ==="
grep -c "koxRanfDaily" /opt/saas/backend/dist/kox/kox.service.js 2>/dev/null || grep -c "koxRanfDaily" /opt/saas/backend/dist/src/kox/kox.service.js 2>/dev/null
echo "=== sync-ranf 状态文件 ==="
ls -la /opt/saas/tools/spark/state/ranf/ 2>/dev/null
echo "=== pm2 ==="
sudo -u deploy bash -lc 'pm2 ls' 2>/dev/null | head -8
