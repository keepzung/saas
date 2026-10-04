#!/bin/bash
# 专业号「线索经营」每日同步 —— deploy 用户 crontab 调用
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/pro-clue-sync.lock
LOG=/opt/saas/logs/pro-clue-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') pro clue sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-pro-clues.cjs >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') pro clue sync failed rc=$RC, retry after 120s =====" >> "$LOG"
  sleep 120
  flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-pro-clues.cjs >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') pro clue sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
