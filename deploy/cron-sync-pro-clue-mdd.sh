#!/bin/bash
# MDD(brand5) 专业号「线索经营」每日同步（进线/开口/留资权威口径）—— deploy 用户 crontab 调用
# 前置：ProOrgConfig brandId=5 已推送 storageState（MCC 数据→经营分析→进入专业号 登录后导出）
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH=/home/deploy/.cache/ms-playwright
LOCK=/tmp/pro-clue-sync-mdd.lock
LOG=/opt/saas/logs/pro-clue-sync-mdd.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') mdd pro clue sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-pro-clues.cjs --brand 5 >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') mdd pro clue sync failed rc=$RC, retry after 120s =====" >> "$LOG"
  sleep 120
  flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-pro-clues.cjs --brand 5 >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') mdd pro clue sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
