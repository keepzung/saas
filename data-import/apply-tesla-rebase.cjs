#!/usr/bin/env node
// 服务器端应用 tesla-rebase-192.json（upsert 192 户 + 非对照表置 disabled）
// 用法: node apply-tesla-rebase.cjs /path/to/tesla-rebase-192.json
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('用法: node apply-tesla-rebase.cjs <json>'); process.exit(1); }
const { accounts } = JSON.parse(fs.readFileSync(file, 'utf8'));
const prisma = new PrismaClient();
(async () => {
  const uidSet = new Set(accounts.map((a) => a.authorId));
  let upserted = 0;
  for (const a of accounts) {
    const data = { ...a, status: 'enabled' };
    await prisma.kosAccount.upsert({
      where: { authorId: a.authorId },
      update: data,
      create: { ...data, brandId: 6, platform: 'xhs' },
    });
    upserted++;
  }
  const all = await prisma.kosAccount.findMany({ where: { brandId: 6, status: 'enabled' }, select: { id: true, authorId: true, nickname: true } });
  const disabled = all.filter((a) => !uidSet.has(a.authorId));
  for (const a of disabled) {
    await prisma.kosAccount.update({ where: { id: a.id }, data: { status: 'disabled' } });
  }
  const cnt = await prisma.kosAccount.count({ where: { brandId: 6, status: 'enabled' } });
  console.log(`完成: upsert ${upserted}，disabled ${disabled.length}，brand6 enabled = ${cnt}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
