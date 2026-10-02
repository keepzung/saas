#!/bin/bash
set -e
cp /tmp/spark-cookie.txt /opt/saas/backend/spark-cookie.tmp
cd /opt/saas/backend
node -e '
const fs = require("fs");
let env = fs.readFileSync(".env", "utf8");
const line = fs.readFileSync("spark-cookie.tmp", "utf8").trim();
if (/^SPARK_COOKIE=/m.test(env)) env = env.replace(/^SPARK_COOKIE=.*$/m, line);
else env += "\n" + line + "\n";
fs.writeFileSync(".env", env);
console.log("prod .env SPARK_COOKIE updated");
'
rm -f spark-cookie.tmp
chown deploy:deploy .env
sudo -u deploy bash -lc 'pm2 restart saas-api --update-env' >/dev/null 2>&1
sleep 3
echo '=== restarted'
