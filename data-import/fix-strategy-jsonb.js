// WritingStrategy persona/audience TEXT → JSONB（与 migration 修订保持一致；列为空，安全）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const rq = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = rq('@prisma/client');
for (const l of fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const p = new PrismaClient();
(async () => {
  await p.$executeRawUnsafe('ALTER TABLE "WritingStrategy" ALTER COLUMN "persona" DROP DEFAULT');
  await p.$executeRawUnsafe('ALTER TABLE "WritingStrategy" ALTER COLUMN "persona" TYPE JSONB USING NULLIF("persona", \'\')::jsonb');
  await p.$executeRawUnsafe('ALTER TABLE "WritingStrategy" ALTER COLUMN "audience" DROP DEFAULT');
  await p.$executeRawUnsafe('ALTER TABLE "WritingStrategy" ALTER COLUMN "audience" TYPE JSONB USING NULLIF("audience", \'\')::jsonb');
  console.log('altered persona/audience -> JSONB');
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
