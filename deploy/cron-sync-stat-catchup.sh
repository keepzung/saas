#!/bin/bash
# 商业内容管理逐日统计兜底：补 T-2/T-1 两天（部分子账户逐日数据出数晚，
# 09:30 的主同步（T-1 单日）会拉到大量「无数据」，本任务在下午出数后补齐；幂等 upsert）
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-content-stat-catchup.lock
LOG=/opt/saas/logs/juguang-content-stat.log
Y2=$(date -d '2 days ago' '+%F')
Y1=$(date -d '1 day ago' '+%F')
echo "===== $(date '+%F %T') stat catchup start ($Y2 ~ $Y1) =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $Y2 --end $Y1 >> $LOG 2>&1"
echo "===== $(date '+%F %T') stat catchup done rc=$? =====" >> "$LOG"
exit 0
