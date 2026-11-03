#!/bin/bash
# 明早限流冷却后补 5 月 7-31 获客工具统计(Excel 未覆盖的 25 天); 幂等可重跑
cd /opt/saas/tools/spark
SLEEP_S=$(( $(date -d "tomorrow 08:05" +%s) - $(date +%s) ))
echo "===== $(date +%F\ %T) 安全网挂载, sleep ${SLEEP_S}s 后执行"
sleep $SLEEP_S
echo "===== $(date +%F\ %T) 开始 5月7-31 补拉"
/usr/local/bin/node backfill-tool-stat.cjs --from 2026-05-07 --to 2026-05-31
echo "===== $(date +%F\ %T) 完成 rc=$?"
