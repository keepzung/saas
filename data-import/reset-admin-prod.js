const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const bcrypt = backendRequire('bcryptjs');
const { PrismaClient } = backendRequire('@prisma/client');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const PHONE = process.env.PROD_ADMIN_PHONE || '18600104701';
const PASSWORD = process.env.PROD_ADMIN_PASSWORD;

if (!PASSWORD || PASSWORD.length < 8) {
  console.error('[reset-admin] need PROD_ADMIN_PASSWORD (>=8 chars)');
  process.exit(1);
}

const sha1 = (text) =>
  crypto.createHash('sha1').update(text, 'utf8').digest('hex');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { phone: PHONE },
      data: { passwordHash: bcrypt.hashSync(sha1(PASSWORD), 10) },
      select: { phone: true, role: true, nickname: true },
    });
    console.log('[reset-admin] ok:', user.phone, user.role, user.nickname || '');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[reset-admin] failed:', e.message || e);
  process.exit(1);
});
