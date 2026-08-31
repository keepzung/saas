#!/usr/bin/env bash
#=============================================================================
# backup.sh — PostgreSQL 每日备份（root 或 postgres 用户，配 cron）
# 备份目录：/var/backups/saas（保留 30 天）
#
# 配置每日 03:00 备份：
#   crontab -e
#   0 3 * * * /bin/bash /opt/saas/deploy/backup.sh >> /var/log/saas-backup.log 2>&1
#=============================================================================
set -euo pipefail

DB_NAME="${DB_NAME:-saas_prod}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/saas}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.dump"

echo "[$(date '+%F %T')] 开始备份 ${DB_NAME} -> ${FILE}"
if [ "$(id -un)" = "root" ]; then
  sudo -u postgres pg_dump -Fc "$DB_NAME" > "$FILE"
else
  pg_dump -Fc "$DB_NAME" > "$FILE"
fi
chown root:postgres "$FILE" 2>/dev/null || true
chmod 640 "$FILE"
echo "[$(date '+%F %T')] 备份完成：$(du -h "$FILE" | cut -f1)"

# 清理过期备份
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] 已清理 ${KEEP_DAYS} 天前的旧备份"
