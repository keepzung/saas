const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const byPlatform = await prisma.kosAccount.groupBy({
      by: ['platform', 'brandId'],
      _count: { _all: true },
    });
    console.log('accounts by platform/brand:');
    for (const g of byPlatform) console.log(' ', g.platform, 'brand', g.brandId, '=', g._count._all);
    const stats = await prisma.koxAccountDailyStat.count();
    console.log('daily stats total =', stats);
    const users = await prisma.user.findMany({
      select: { phone: true, role: true, nickname: true },
      orderBy: { id: 'asc' },
    });
    console.log('users:');
    for (const u of users) console.log(' ', u.phone, u.role, u.nickname || '');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('check failed:', e.message || e);
  process.exit(1);
});
