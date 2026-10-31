#!/bin/bash
# 商业内容管理逐日统计兜底：扫 T-7~T-1（部分子账户逐日数据出数晚，下午出数后补齐；
# sync-juguang-content --stat-daily 对已存在的 (day,子账户) 行自动跳过，窗口虽宽但只拉缺失天；
# 周末/漏登数天的缺口在下一次登录后的本任务中自愈；幂等 upsert）
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-content-stat-catchup.lock
LOG=/opt/saas/logs/juguang-content-stat.log
Y2=$(date -d '7 days ago' '+%F')
Y1=$(date -d '1 day ago' '+%F')
echo "===== $(date '+%F %T') stat catchup start ($Y2 ~ $Y1) =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $Y2 --end $Y1 >> $LOG 2>&1"
echo "===== $(date '+%F %T') stat catchup done rc=$? =====" >> "$LOG"
exit 0
