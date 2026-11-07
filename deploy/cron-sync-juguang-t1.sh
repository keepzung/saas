#!/bin/bash
# 聚光「标准投笔记报表」T+1 晨间波次 —— 近 3 天逐日段（方案一，与 pull-t1 同参）
# 2026-11-07 新增：原唯一日常波次在 10:30 拖块后（登录钩子触发 pull-t1），不满足
# "每天早上 D-1 齐全" SLA；平台 D-1 数零点后即出、partner 会话过夜存活已是常态，
# 故 01:10 用活会话静默拉取（NO_RELOGIN=1：只拉数不登录，会话死则快速失败零风险）。
# 幂等：逐日段重拉同值覆盖；与周日 23:30 全窗校准共用 juguang-sync.lock。
set -u
export NO_RELOGIN=1
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-sync.lock
LOG=/opt/saas/logs/juguang-sync.log
mkdir -p /opt/saas/logs
Y2=$(date -d '2 days ago' '+%F')
Y1=$(date -d '1 day ago' '+%F')
echo "===== $(date '+%F %T') juguang t1 start ($Y2 ~ $Y1) =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && JG_PER_DAY_DAYS=3 /usr/local/bin/node sync-juguang.cjs --start $Y2 --end $Y1 >> $LOG 2>&1"
echo "===== $(date '+%F %T') juguang t1 done rc=$? =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
