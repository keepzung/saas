#!/bin/bash
# 补装 content 增量 cron（幂等）
runuser -u deploy -- bash -c '(crontab -l 2>/dev/null | grep -v cron-sync-juguang-content; echo "45 11 * * * /opt/saas/deploy/cron-sync-juguang-content.sh") | crontab -'
echo "--- deploy crontab ---"
runuser -u deploy -- crontab -l
