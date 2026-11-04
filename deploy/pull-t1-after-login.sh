#!/bin/bash
# 登录即全量落库编排器（2026-11-02 定稿）：每天唯一一次 partner 数据拉取波次，
# 由人工登录钩子（partner-keepalive-local.cjs）触发，替代原"stat-daily+sync-juguang"残缺链。
# 流程: 轻探针等平台出数(T-1,顺便记录每日真实出数时间) → 特斯拉(发布数/笔记元数据/投放)
#       → MDD(笔记/笔记×日/线索分析/获客工具)
# 约束: NO_RELOGIN=1 全程禁止账密自动重登（登录只允许人工例程）；单实例锁；幂等可重复触发。
set -u
export NO_RELOGIN=1
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOG=/opt/saas/logs/pull-t1.log
T1=$(date -d '1 day ago' +%F)
TODAY=$(date +%F)
DEADLINE=$(date -d '13:35' +%s)
mkdir -p /opt/saas/logs
exec 9>/tmp/pull-t1.lock
flock -n 9 || { echo "===== $(date '+%F %T') pull-t1 already running, exit =====" >> "$LOG"; exit 0; }
echo "===== $(date '+%F %T') pull-t1 start (T-1=$T1) =====" >> "$LOG"

# ① 等待平台出数：探针每 10 分钟一次，最迟 13:35；PROBE_RESULT 行即每日出数时间档案
probed=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  OUT=$(runuser -u deploy -- bash -c "cd /opt/saas/tools/spark && STAT_PROBE_ONLY=1 JG_TARGET=特斯拉KOS项目-基础 /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $T1 --end $T1" 2>&1 | grep 'PROBE_RESULT' | tail -1)
  echo "----- $(date '+%F %T') probe: ${OUT:-no-output}" >> "$LOG"
  case "$OUT" in
    *noteNum=0*|*noteNum=null*|*total=null*|*total=0*|""|*no-output*) : ;;   # 未出数/会话异常 → 继续等
    *noteNum=*) probed=1; break ;;                                           # 已出数 → 立即全量拉
    *) : ;;
  esac
  sleep 600
done
[ "$probed" = 1 ] || echo "----- $(date '+%F %T') no data by deadline, pulling anyway (14:10 catchup 兜底)" >> "$LOG"

# ② 特斯拉 brand6：发布数逐日(近7天,幂等跳过已存在) → 笔记元数据 → 投放主表 → 投放笔记明细
echo "----- $(date '+%F %T') [6] stat-daily 7d" >> "$LOG"
runuser -u deploy -- bash -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $(date -d '7 days ago' +%F) --end $TODAY" >> "$LOG" 2>&1
echo "----- $(date '+%F %T') [6] koxnote --days 7" >> "$LOG"
runuser -u deploy -- bash -c "cd /opt/saas/tools/spark && /usr/local/bin/node sync-juguang-content.cjs --days 7" >> /opt/saas/logs/juguang-content-sync.log 2>&1
echo "----- $(date '+%F %T') [6] trigger-sync all 6" >> "$LOG"
runuser -u deploy -- bash -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs all 6" >> "$LOG" 2>&1
echo "----- $(date '+%F %T') [6] sync-juguang note-detail (方案一: 近3天逐日, 周日23:30全窗校准)" >> "$LOG"
JG_START=$(date -d "$T1 -2 days" +%F)
runuser -u deploy -- bash -c "cd /opt/saas/tools/spark && JG_PER_DAY_DAYS=3 /usr/local/bin/node sync-juguang.cjs --start $JG_START --end $T1" >> /opt/saas/logs/juguang-sync.log 2>&1

# ③ MDD brand5：等人工例程后续步骤刷新 brand5 cookie（≤40 分钟），再跑四步链
cookieFresh=f
for i in $(seq 1 40); do
  cookieFresh=$(sudo -u postgres psql saas_prod -Atc "SELECT extract(epoch from ((now() AT TIME ZONE 'utc') - \"updatedAt\"))::int < 5400 FROM \"SparkOrgConfig\" WHERE \"brandId\"=5;" 2>/dev/null | tr -d '[:space:]')
  [ "$cookieFresh" = "t" ] && break
  sleep 60
done
echo "----- $(date '+%F %T') [5] mdd chain start (cookieFresh=$cookieFresh)" >> "$LOG"
for t in notes notes_daily clue_analysis clue_acq_tool; do
  echo "----- $(date '+%F %T') [5] $t" >> "$LOG"
  runuser -u deploy -- bash -c "cd /opt/saas/tools && /usr/local/bin/node trigger-sync.cjs $t 5" >> "$LOG" 2>&1 || sleep 30
done
echo "===== $(date '+%F %T') pull-t1 done =====" >> "$LOG"
tail -n 3000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
exit 0
