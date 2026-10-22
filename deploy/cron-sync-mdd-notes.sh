#!/bin/bash
# MDD(brand5) 笔记同步：① 滚动刷新 30 天窗口内笔记指标（daily 模式对 brand5 自动扩窗）
# ② 笔记×日维度（KoxNoteDailyStat，MDD 总览日维度权威口径）—— deploy 用户 crontab 调用
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH=/home/deploy/.cache/ms-playwright
LOCK=/tmp/mdd-notes-sync.lock
LOG=/opt/saas/logs/mdd-notes-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') mdd notes sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_analysis 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_acq_tool 5 >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') mdd notes sync failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_analysis 5 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_acq_tool 5 >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') mdd notes sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
