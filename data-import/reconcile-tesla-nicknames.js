#!/usr/bin/env node
// 特斯拉(brand 6) KOS 基线昵称对齐：以专业号员工数据(ProKosStaff)最新快照的平台昵称为准，
// 按 UID(authorId=userId) 对齐 KosAccount.nickname。解决 KOS 在平台改名后，
// 乐允工作区（总览排行/账号表现/监测账号列表）仍显示旧昵称的问题。
// 底表 authorId 非真实 UID（tesla_<md5>/auto_ 派生值）的账号无法比对，跳过并列出。
// 用法:
//   node reconcile-tesla-nicknames.js            （预览差异，不写库）
//   node reconcile-tesla-nicknames.js --apply    （写入）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const APPLY = process.argv.includes('--apply');
const BRAND = 6;

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // 每个员工号取 statDate 最新一行的平台昵称（快照表历史行保留旧名，不可用作现状）
    const staffRows = await prisma.proKosStaff.findMany({
      where: { brandId: BRAND, nickName: { not: '' } },
      select: { userId: true, nickName: true, statDate: true },
      orderBy: { statDate: 'asc' },
    });
    const latestNick = new Map();
    for (const r of staffRows) latestNick.set(r.userId, r.nickName);

    const allAccounts = await prisma.kosAccount.findMany({
      where: { brandId: BRAND, status: 'enabled' },
      select: { id: true, authorId: true, nickname: true, storeName: true },
    });
    const accounts = allAccounts.filter((a) => /^[0-9a-f]{24}$/.test(a.authorId));

    const nickTaken = new Set(accounts.map((a) => a.nickname));
    const renames = [];
    for (const a of accounts) {
      const platform = latestNick.get(a.authorId);
      if (!platform || platform === a.nickname) continue;
      // 目标昵称与其他基线账号重名 → 跳过并提示，避免把两行混成一人
      if (nickTaken.has(platform) && platform !== a.nickname) {
        console.log(`⚠ 重名冲突跳过: ${a.nickname} → ${platform}（已有账号占用该昵称）`);
        continue;
      }
      renames.push({ ...a, platform });
    }

    console.log(`专业号员工号: ${latestNick.size}，基线启用账号(真实UID): ${accounts.length}`);
    if (!renames.length) {
      console.log('无昵称差异，底表已是平台最新昵称。');
      return;
    }
    console.log(`检测到改名 ${renames.length} 个:`);
    for (const r of renames) {
      console.log(`  ${r.nickname}  →  ${r.platform}   [${r.storeName ?? '-'}] uid=${r.authorId}`);
    }
    if (!APPLY) {
      console.log('（预览模式，未写库；确认后加 --apply 执行）');
      return;
    }
    for (const r of renames) {
      await prisma.kosAccount.update({ where: { id: r.id }, data: { nickname: r.platform } });
      nickTaken.delete(r.nickname);
      nickTaken.add(r.platform);
    }
    console.log(`已写入 ${renames.length} 个昵称。`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
