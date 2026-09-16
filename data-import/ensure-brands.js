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

const WORKSPACES = ['东风项目工作区', '格力项目工作区', '大众项目工作区'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
    if (!company) throw new Error('no company row found');
    let maxId = 0;
    const all = await prisma.brand.findMany({ select: { id: true, name: true } });
    for (const b of all) maxId = Math.max(maxId, b.id);
    for (const name of WORKSPACES) {
      const exist = all.find((b) => b.name === name);
      if (exist) {
        console.log('brand exists:', exist.id, name);
        continue;
      }
      maxId += 1;
      const created = await prisma.brand.create({
        data: { id: maxId, name, companyId: company.id, status: 1 },
      });
      console.log('brand created:', created.id, name);
    }
    const total = await prisma.brand.count();
    console.log('brand total =', total);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('ensure-brands failed:', e.message || e);
  process.exit(1);
});
