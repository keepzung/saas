#!/bin/bash
# 重排三个同步 cron：08:30 content / 08:50 pro-clue / 09:15 juguang（10:15 前全部完成）
set -u
runuser -u deploy -- bash -c "crontab -l | sed -e 's|^0 11 \* \* \* /opt/saas/deploy/cron-sync-pro-clue.sh|0 9 * * * /opt/saas/deploy/cron-sync-pro-clue.sh|' -e 's|^30 11 \* \* \* /opt/saas/deploy/cron-sync-juguang.sh|15 9 * * * /opt/saas/deploy/cron-sync-juguang.sh|' -e 's|^30 13 \* \* \* /opt/saas/deploy/cron-sync-juguang-content.sh|30 8 * * * /opt/saas/deploy/cron-sync-juguang-content.sh|' | crontab -"
echo "--- crontab after ---"
crontab -u deploy -l
