// BatchTask 补 config/brandId 列（与 migration 修订同步，本地增量）
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
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name='BatchTask' AND column_name IN ('config','brandId')",
  );
  const have = new Set(cols.map((c) => c.column_name));
  if (!have.has('config')) {
    await p.$executeRawUnsafe('ALTER TABLE "BatchTask" ADD COLUMN "config" JSONB');
    console.log('added config');
  }
  if (!have.has('brandId')) {
    await p.$executeRawUnsafe('ALTER TABLE "BatchTask" ADD COLUMN "brandId" INTEGER NOT NULL DEFAULT 1');
    await p.$executeRawUnsafe('CREATE INDEX "BatchTask_brandId_idx" ON "BatchTask"("brandId")');
    console.log('added brandId');
  }
  if (have.size === 2) console.log('columns already present');
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
