#!/bin/bash
# 生产 ranf/pro-clue/juguang 定时任务一次性配置
set -e
chmod +x /opt/saas/deploy/cron-sync-pro-clue.sh /opt/saas/deploy/cron-sync-juguang.sh /opt/saas/deploy/cron-sync-ranf.sh 2>/dev/null || true
chown deploy:deploy /opt/saas/deploy/cron-sync-*.sh
runuser -u deploy -- bash -c '(crontab -l 2>/dev/null | grep -v "cron-sync-pro-clue\|cron-sync-juguang"; echo "0 11 * * * /opt/saas/deploy/cron-sync-pro-clue.sh"; echo "30 11 * * * /opt/saas/deploy/cron-sync-juguang.sh") | crontab -'
echo "--- deploy crontab ---"
runuser -u deploy -- crontab -l
