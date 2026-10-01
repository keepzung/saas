#!/bin/bash
# ranf（data.ranf.cloud）每日同步 —— deploy 用户 crontab 调用
# 增量抓取：KoxRanfDaily 最新日+1 ~ 今天（T+1 标注域），幂等可重复执行
set -u
LOCK=/tmp/ranf-sync.lock
LOG=/opt/saas/logs/ranf-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') ranf sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && node sync-ranf.cjs >> $LOG 2>&1"
RC=$?
echo "===== $(date '+%F %T') ranf sync done rc=$RC =====" >> "$LOG"
# 日志保留 2000 行
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
