#!/bin/bash
# 错峰：content cron 11:45 -> 13:30；补 prisma generate
set -u
runuser -u deploy -- bash -c "crontab -l | sed 's|^45 11 \* \* \* /opt/saas/deploy/cron-sync-juguang-content.sh|30 13 * * * /opt/saas/deploy/cron-sync-juguang-content.sh|' | crontab -"
echo "--- crontab after ---"
crontab -u deploy -l
echo "--- prisma generate ---"
runuser -u deploy -- bash -c "cd /opt/saas/backend && npx prisma generate 2>&1 | tail -2"
