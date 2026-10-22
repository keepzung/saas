#!/bin/bash
# MDD 笔记封面慢补（每小时一批 ≤15 条，阅读量优先，避免触发小红书风控）— root crontab 调用
# crontab: 24 * * * * /bin/bash /opt/saas/deploy/cron-sync-mdd-covers.sh
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/mdd-covers.lock
LOG=/opt/saas/logs/mdd-covers.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') mdd covers batch start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas && /usr/local/bin/node tools/spark/backfill-mdd-covers.cjs --order views --limit 15 >> $LOG 2>&1"
RC=$?
echo "===== $(date '+%F %T') mdd covers batch done rc=$RC =====" >> "$LOG"
# 日志只保留末尾 2000 行
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
