#!/bin/bash
# 聚光「标准投笔记报表」每日同步 —— deploy 用户 crontab 调用
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-sync.lock
LOG=/opt/saas/logs/juguang-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') juguang sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang.cjs >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') juguang sync failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang.cjs >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') juguang sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
