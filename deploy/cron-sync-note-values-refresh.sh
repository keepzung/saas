#!/bin/bash
# 品牌通用 KoxNote 数值列轻刷(合并 df/mdd 两版,2026-11-25)—— deploy 用户 crontab 调用
# 用法: cron-sync-note-values-refresh.sh <brandId>
# 每品牌独立锁与日志(两品牌槽位同分钟,勿共用锁)
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
BRAND="${1:-7}"
LOCK="/tmp/note-values-refresh-$BRAND.lock"
LOG="/opt/saas/logs/note-values-refresh-$BRAND.log"
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') b$BRAND note values refresh start =====" >> "$LOG"
flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/note-values-refresh.cjs --brand=$BRAND >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') b$BRAND note values refresh failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "/usr/local/bin/node /opt/saas/tools/note-values-refresh.cjs --brand=$BRAND >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') b$BRAND note values refresh done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
