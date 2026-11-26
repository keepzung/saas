#!/bin/bash
# 单日落库自动检查+自愈(可观测配套):检查某日的笔记是否落库;
# cookie 活着但有品牌未落 → 自动触发一轮同步(笔记链/线索) → 等待后复核;
# cookie 失效 → 如实报告需人工登录(不盲目补)。
# 用法: check-day-landing.sh [YYYY-MM-DD]   (默认昨天) 输出: /opt/saas/logs/check-day-<date>.log
set -u
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
DATE="${1:-$(date -d '1 day ago' +%F)}"
LOG="/opt/saas/logs/check-day-$DATE.log"
mkdir -p /opt/saas/logs
log() { echo "----- $(date '+%F %T') $*" >> "$LOG"; }

log "=== 单日落库检查 start ($DATE) ==="
/usr/local/bin/node /opt/saas/tools/check-day-landing.cjs --date="$DATE" >> "$LOG" 2>&1
if /usr/local/bin/node /opt/saas/tools/check-day-landing.cjs --date="$DATE" --json 2>/dev/null | grep -q '"all_landed": true'; then
  log "=== 结果: 全部落库, 无需处理 ==="
  tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
  exit 0
fi

# 有品牌未落 → 验 cookie
COOKIE_DEAD=0
COOKIE_OUT=$(/usr/local/bin/node /opt/saas/tools/cookie-validity-test.cjs 2>/dev/null || true)
echo "$COOKIE_OUT" >> "$LOG"
if ! echo "$COOKIE_OUT" | grep -q 'ALIVE'; then
  log "=== 结果: MCC cookie 全部/多数失效 → 需人工登录(daily-login.cmd), 登录后 safeSync/cron 自动补齐 ==="
  tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
  exit 3
fi

# cookie 活着 → 触发一轮同步(笔记+线索), 等平台/同步完成再复核
log "=== cookie 有效, 触发一轮笔记+线索同步后复核 ==="
for B in 2 5 7 8; do
  /usr/local/bin/node /opt/saas/tools/trigger-sync.cjs notes "$B" >> "$LOG" 2>&1 || true
done
for B in 5 7; do
  /usr/local/bin/node /opt/saas/tools/trigger-sync.cjs clue_analysis "$B" --date="$DATE" >> "$LOG" 2>&1 || true
  /usr/local/bin/node /opt/saas/tools/trigger-sync.cjs clue_acq_tool "$B" --date="$DATE" >> "$LOG" 2>&1 || true
done
sleep 600
/usr/local/bin/node /opt/saas/tools/check-day-landing.cjs --date="$DATE" >> "$LOG" 2>&1
if /usr/local/bin/node /opt/saas/tools/check-day-landing.cjs --date="$DATE" --json 2>/dev/null | grep -q '"all_landed": true'; then
  log "=== 结果: 触发同步后已补齐 ==="
else
  log "=== 结果: 同步后仍未全落 → 平台分区未出或同步异常, 详见上方 JSON; 建议跑 patrol 并人工排查 ==="
fi
tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
