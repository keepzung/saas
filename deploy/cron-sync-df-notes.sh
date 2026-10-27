#!/bin/bash
# 东风(brand7) 笔记同步：① 滚动刷新 30 天窗口内笔记指标（聚光，与 mdd-notes 同款触发器）
# ② 笔记×日维度（KoxNoteDailyStat）—— deploy 用户 crontab 调用
# 东风无线索分析/获客工具链路（不来鼓），故不含 clue_analysis/clue_acq_tool 槽位
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/df-notes-sync.lock
LOG=/opt/saas/logs/df-notes-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') df notes sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes 7 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily 7 >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') df notes sync failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes 7 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily 7 >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') df notes sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
