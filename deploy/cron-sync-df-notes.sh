#!/bin/bash
# 东风(brand7) 笔记+线索同步：① 滚动刷新 30 天窗口内笔记指标（聚光，与 mdd-notes 同款触发器）
# ② 笔记×日维度（KoxNoteDailyStat）③ 线索分析 + 获客工具统计（2026-11-24 运营总览漏斗
#    切 MCC 线索口径——笔记报表私信字段 10-13 起平台断供，与 MDD 同款公式）—— deploy 用户 crontab 调用
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/df-notes-sync.lock
LOG=/opt/saas/logs/df-notes-sync.log
mkdir -p /opt/saas/logs
CHAIN="cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs notes 7 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs notes_daily 7 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_analysis 7 >> $LOG 2>&1 && /usr/local/bin/node trigger-sync.cjs clue_acq_tool 7 >> $LOG 2>&1"
echo "===== $(date '+%F %T') df notes sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "$CHAIN"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') df notes sync failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "$CHAIN"
  RC=$?
fi
echo "===== $(date '+%F %T') df notes sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
