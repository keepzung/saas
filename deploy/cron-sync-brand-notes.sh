#!/bin/bash
# 品牌通用笔记链同步(合并 df/mdd 两版,2026-11-25)—— deploy 用户 crontab 调用
# 链路: notes(滚动30天窗/日分区) → notes_daily(笔记×日) → clue_analysis → clue_acq_tool
# 用法: cron-sync-brand-notes.sh <brandId>   每品牌独立锁与日志
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
BRAND="${1:-7}"
LOCK="/tmp/brand-notes-sync-$BRAND.lock"
LOG="/opt/saas/logs/brand-notes-sync-$BRAND.log"
mkdir -p /opt/saas/logs
CHAIN="cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes $BRAND >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily $BRAND >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_analysis $BRAND >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_acq_tool $BRAND >> $LOG 2>&1"
echo "===== $(date '+%F %T') b$BRAND notes chain start =====" >> "$LOG"
flock -xn "$LOCK" -c "$CHAIN"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') b$BRAND notes chain failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "$CHAIN"
  RC=$?
fi
echo "===== $(date '+%F %T') b$BRAND notes chain done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
