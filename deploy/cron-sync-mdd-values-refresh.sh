#!/bin/bash
# MDD(brand5) KoxNote 数值列 30 分钟轻刷（轻量查询与星火后台/导出对齐，只更新数值列不动元数据）
# deploy 用户 crontab：*/30 * * * * /opt/saas/deploy/cron-sync-mdd-values-refresh.sh
# 注意：09:50 的全量元数据同步走 cron-sync-mdd-notes.sh，两个槽位勿互相抢占
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/mdd-values-refresh.lock
LOG=/opt/saas/logs/mdd-values-refresh.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') mdd values refresh start =====" >> "$LOG"
flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/mdd-note-values-refresh.cjs >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') mdd values refresh failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/mdd-note-values-refresh.cjs >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') mdd values refresh done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
