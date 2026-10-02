#!/bin/bash
set -e
cd /opt/saas/backend
sudo -u deploy bash -lc '
export $(grep -E "^DATABASE_URL=" .env | xargs)
TOKEN=$(node -e "
const crypto = require(\"crypto\");
const password = crypto.createHash(\"sha1\").update(\"Marketine@2026\").digest(\"hex\");
(async () => {
  let res = await fetch(\"http://127.0.0.1:3000/api/agency-api/login\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ username: \"18510234580\", password }) }).then(r => r.json());
  if (res.code === 10015) res = await fetch(\"http://127.0.0.1:3000/api/agency-api/login\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ username: \"18510234580\", password, main_company_id: \"2\" }) }).then(r => r.json());
  console.log(res.data.token);
})();
")
echo "token acquired: ${TOKEN:0:20}..."
curl -s -X POST http://127.0.0.1:3000/api/agency-api/spark/sync \
  -H "token: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"type\":\"notes\",\"backfill\":true}"
echo ""
'
