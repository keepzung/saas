#!/bin/bash
# MCC 三家（荣威2/MDD5/东风7）D-1 兜底：笔记日数据(NDS) + 员工矩阵日档，每天 13:15
# 背景（11-08 定版）：
#  - NDS 的 D-1 date_key 中午才出，晨间 05:40/05:50 波次只能拉到 D-2，白天无重拉（b5/b7）；
#    b2 更是从未有 notes_daily cron。
#  - SparkStaffUserDaily 是当日快照表：D-1 分区必须当天有人拉，晨间波次 cookie 死亡即永久洞，
#    staff_matrix 支持 --date 回填（幂等）。
# 全程 NO_RELOGIN（闸门在 trigger-sync 端），cookie 死则静默失败，次日同一波次自愈。
set -u
export NO_RELOGIN=1
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/mcc-ndsp-backfill.lock
LOG=/opt/saas/logs/mcc-ndsp-backfill.log
mkdir -p /opt/saas/logs
Y1=$(date -d '1 day ago' '+%F')
echo "===== $(date '+%F %T') mcc ndsp backfill start (T-1=$Y1) =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools && \
  /usr/local/bin/node trigger-sync.cjs notes_daily 5 >> $LOG 2>&1; \
  /usr/local/bin/node trigger-sync.cjs notes_daily 7 >> $LOG 2>&1; \
  /usr/local/bin/node trigger-sync.cjs notes_daily 2 >> $LOG 2>&1; \
  /usr/local/bin/node trigger-sync.cjs staff_matrix 5 --date=$Y1 >> $LOG 2>&1; \
  /usr/local/bin/node trigger-sync.cjs staff_matrix 7 --date=$Y1 >> $LOG 2>&1; \
  /usr/local/bin/node trigger-sync.cjs staff_matrix 2 --date=$Y1 >> $LOG 2>&1; \
  echo '===== ndsp backfill done' >> $LOG"
echo "===== $(date '+%F %T') mcc ndsp backfill done =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
