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

const FROM = process.env.FROM_PHONE;
const TO = process.env.TO_PHONE;

if (!FROM || !TO || !/^1\d{10}$/.test(TO)) {
  console.error('[change-phone] need FROM_PHONE / TO_PHONE (11-digit CN mobile)');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { phone: FROM } });
    if (!user) {
      console.error(`[change-phone] source user not found: ${FROM}`);
      process.exit(1);
    }
    const conflict = await prisma.user.findUnique({ where: { phone: TO } });
    if (conflict) {
      console.error(`[change-phone] target phone already used by user id=${conflict.id}`);
      process.exit(1);
    }
    const updated = await prisma.user.update({
      where: { phone: FROM },
      data: { phone: TO },
      select: { phone: true, role: true, nickname: true },
    });
    console.log('[change-phone] ok:', updated.phone, updated.role, updated.nickname || '');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[change-phone] failed:', e.message || e);
  process.exit(1);
});
