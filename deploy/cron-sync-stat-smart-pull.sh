#!/bin/bash
# 商业内容逐日"探针式智能拉取"：01:00-07:30 每 30 分钟探一次平台出数，
# 出数立即全量补拉 T-7~T-1 并写当日标记；未出数只花一次轻探针（单请求）。
# 背景（11-09 定版）：商业内容 D-1 出数时刻漂移（01:06/01:53/02:15/03:20/09:03/10:40 均实测），
# 固定重试槽会踩空；探针式=出数后 ≤30 分钟落库，未出数时拉取成本≈0。
# 三级短路：①当日标记已存在 → 退出；②库中 D-1 合计行已有真实数据 → 打标记退出（不启浏览器）；
# ③探针 PROBE_RESULT noteNum>0 → 全量 stat-daily（幂等跳过已有天）→ 打标记。
set -u
export NO_RELOGIN=1
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
LOCK=/tmp/juguang-content-stat.lock
LOG=/opt/saas/logs/juguang-content-stat.log
MARKER="/tmp/stat-smart-pull-$(date +%F).done"
T1=$(date -d '1 day ago' +%F)
Y7=$(date -d '7 days ago' +%F)
[ -f "$MARKER" ] && exit 0
mkdir -p /opt/saas/tools/state

# ② 库里 D-1 已有真实合计行（impNum>0）→ 直接打标记，不启浏览器
# （北京日 T1 的桶 = T1 前一天 16:00，UTC 字面存储）
DB=$(grep -oP 'DATABASE_URL="\K[^"]+' /opt/saas/backend/.env | sed 's/?.*//')
DAYSTR=$(date -d "$T1 -8 hour" '+%F 16:00')
HAVE=$(psql "$DB" -t -A -c "SELECT count(*) FROM \"KoxContentStatDaily\" WHERE \"brandId\"=6 AND day='$DAYSTR' AND \"impNum\">0" 2>/dev/null)
if [ "${HAVE:-0}" != "0" ]; then
  touch "$MARKER"
  exit 0
fi

echo "----- $(date '+%F %T') smart-probe (T-1=$T1)" >> "$LOG"
flock -xn "$LOCK" -c "cd /opt/saas/tools/spark && OUT=\$(STAT_PROBE_ONLY=1 JG_TARGET=特斯拉KOS项目-基础 /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $T1 --end $T1 2>&1 | grep PROBE_RESULT | tail -1); echo \"----- \$(date '+%F %T') smart-probe: \${OUT:-no-output}\" >> $LOG; case \"\$OUT\" in *noteNum=0*|*noteNum=null*|*total=null*|*total=0*|*no-output*|'') exit 0;; *noteNum=*) /usr/local/bin/node sync-juguang-content.cjs --stat-daily --start $Y7 --end $T1 >> $LOG 2>&1 && touch $MARKER;; esac"
exit 0
