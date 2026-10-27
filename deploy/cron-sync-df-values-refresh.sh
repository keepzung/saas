#!/bin/bash
# 东风(brand7) KoxNote 数值列 30 分钟轻刷（与 mdd-values-refresh 同款拉数逻辑，拉东风自己的聚光）
# deploy 用户 crontab：*/30 * * * * /opt/saas/deploy/cron-sync-df-values-refresh.sh
# 注意：全量元数据同步走 cron-sync-df-notes.sh，两个槽位勿互相抢占
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/df-values-refresh.lock
LOG=/opt/saas/logs/df-values-refresh.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') df values refresh start =====" >> "$LOG"
flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/df-note-values-refresh.cjs >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') df values refresh failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/df-note-values-refresh.cjs >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') df values refresh done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
