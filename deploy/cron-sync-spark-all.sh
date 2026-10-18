#!/bin/bash
# 每日星火全组织兜底同步（campaign+notes，T+1 断档自动回填 7 天）
# 说明：backend 内部已有小时级定时同步（SPARK_SYNC_INTERVAL_MINUTES=60），
# 此 cron 为第二道保险——即使 backend 定时器/进程异常，也能保证每天更新一次。
# brandId=6（特斯拉 partner 通道）；2026-10-12 修复：原脚本误传 ' ' 作为 brandId
# （Number(' ')===0，同步了不存在的品牌，任务 0.3s 空转）
# 2026-10-19 修复：cron 环境 PATH 不含 node（此前持续报 node: command not found 空转）
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
cd /opt/saas/tools && node trigger-sync.cjs all 6 >> /var/log/saas-sync-daily.log 2>&1
