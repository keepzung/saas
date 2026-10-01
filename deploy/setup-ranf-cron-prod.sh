#!/bin/bash
# 生产 ranf 定时同步一次性配置：删废弃 pm2 任务 + 装 deploy crontab
set -e
chmod +x /opt/saas/deploy/cron-sync-ranf.sh
chown deploy:deploy /opt/saas/deploy/cron-sync-ranf.sh
rm -f /tmp/verify-trend.cjs /root/check-ranf-prod.sh
runuser -u deploy -- bash -c 'pm2 delete ranf-sync >/dev/null 2>&1 || true; pm2 save >/dev/null 2>&1 || true'
runuser -u deploy -- bash -c '(crontab -l 2>/dev/null | grep -v cron-sync-ranf; echo "30 10 * * * /opt/saas/deploy/cron-sync-ranf.sh"; echo "0 20 * * * /opt/saas/deploy/cron-sync-ranf.sh") | crontab -'
echo "--- deploy crontab ---"
runuser -u deploy -- crontab -l
echo "--- 立即试跑一次（抓今日 T+1 行）---"
runuser -u deploy -- bash /opt/saas/deploy/cron-sync-ranf.sh
tail -20 /opt/saas/logs/ranf-sync.log
