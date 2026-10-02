#!/bin/bash
# 移除 ranf 定时任务（ranf 数据源已弃用：趋势/线索改走专业号+聚光）
runuser -u deploy -- bash -c '(crontab -l 2>/dev/null | grep -v cron-sync-ranf) | crontab -'
echo "--- deploy crontab ---"
runuser -u deploy -- crontab -l
