#!/bin/bash
sudo -u deploy bash -lc 'pm2 ls' 2>/dev/null | grep saas-api | head -1
sudo -u deploy git -C /opt/saas log --oneline -1
curl -s -o /dev/null -w 'frontend %{http_code}\n' http://127.0.0.1/
