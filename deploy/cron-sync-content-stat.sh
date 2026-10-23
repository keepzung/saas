#!/bin/bash
# 商业内容管理逐账号逐日统计（合计行 KoxContentStatDaily + 逐笔记行 KoxContentNoteDaily）
# 逐笔记行 = 滚动发布窗口（缺省近 35 天）内发布的员工笔记 × 单日数据表现（区域数据分析时段发布口径）
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-content-stat.lock
LOG=/opt/saas/logs/juguang-content-stat.log
mkdir -p /opt/saas/logs
YD=$(date -d '1 day ago' '+%F')
echo "===== $(date '+%F %T') content stat sync start ($YD) =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $YD --end $YD >> $LOG 2>&1"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "===== $(date '+%F %T') stat sync failed rc=$RC, retry after 180s =====" >> "$LOG"
  sleep 180
  flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $YD --end $YD >> $LOG 2>&1"
  RC=$?
fi
echo "===== $(date '+%F %T') content stat sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
