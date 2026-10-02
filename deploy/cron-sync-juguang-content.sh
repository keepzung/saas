#!/bin/bash
# 商业内容管理每日增量同步（近 7 天发布的新笔记：元数据 + 赞/藏/评/分享/关注/私信指标叠加）
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-content-inc.lock
LOG=/opt/saas/logs/juguang-content-sync.log
mkdir -p /opt/saas/logs
echo "===== $(date '+%F %T') content sync start =====" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --days 7 >> $LOG 2>&1"
RC=$?
echo "===== $(date '+%F %T') content sync done rc=$RC =====" >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
