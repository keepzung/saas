#!/usr/bin/env node
// 东风(brandId=7)占位 UID 回填为真实 UID（幂等，可重跑）
// 缘故：2026-09-26 建库导入时源 CSV 缺 UID，import-dongfeng.js 用 df_<md5(昵称)> 兜底。
// 本脚本按《奕境小红书AIGC账号清单1012.xlsx》Sheet2 的真实 UID 回填（人员姓名+手机号核对）。
// 注意：关联表（KoxNote/ContentTaskTarget 等）走 accountId 整型外键，改 authorId 不影响已有数据归属。
// 沈苏洋（df_3d1d39e137119be1）不在 1012 清单中，待拿到真实 UID 后在 MAP 中补充。
// 用法: node backfill-df-real-uid.js [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run');
const BRAND = 7;

// 账号昵称(库内当前名) / 人员 / 清单内昵称 → 真实 UID（来源：奕境小红书AIGC账号清单1012.xlsx Sheet2）
const MAP = [
  { oldUid: 'df_5b536a24fab404b1', owner: '闻媛', listNick: '小红薯6392CA35', uid: '6391b1e4000000001f01f4b8' },
  { oldUid: 'df_8b6a32b34d53adb7', owner: '周瑾', listNick: '奕境momo', uid: '66d7bb88000000001d0321ee' },
  { oldUid: 'df_6a612663474a554b', owner: '喻晨成', listNick: '小红薯682469C2', uid: '682339be000000000e013b35' },
];

const prisma = new PrismaClient();

async function main() {
  console.log(`东风占位UID回填${DRY_RUN ? '（dry-run）' : ''}`);
  for (const m of MAP) {
    if (!/^[0-9a-f]{24}$/.test(m.uid)) throw new Error(`${m.owner} 的目标 UID 非法: ${m.uid}`);
    const acc = await prisma.kosAccount.findUnique({ where: { authorId: m.oldUid } });
    if (!acc) {
      const byNew = await prisma.kosAccount.findUnique({ where: { authorId: m.uid } });
      if (byNew && byNew.brandId === BRAND) { console.log(`${m.owner}: 已是真实 UID（${m.uid}），跳过`); continue; }
      throw new Error(`${m.owner}: 找不到占位账号 ${m.oldUid} 且目标 UID 也未落库，请人工核对`);
    }
    if (acc.brandId !== BRAND) throw new Error(`${m.owner}: 账号 ${m.oldUid} 不属于 brand ${BRAND}`);
    const clash = await prisma.kosAccount.findUnique({ where: { authorId: m.uid } });
    if (clash) throw new Error(`${m.owner}: 目标 UID ${m.uid} 已被账号占用（${clash.nickname}）`);
    if (!DRY_RUN) {
      await prisma.kosAccount.update({ where: { id: acc.id }, data: { authorId: m.uid } });
    }
    console.log(`${m.owner}: ${m.oldUid} → ${m.uid}（昵称: ${acc.nickname}，accountId=${acc.id} 不变）`);
  }
  const left = await prisma.kosAccount.count({ where: { brandId: BRAND, authorId: { startsWith: 'df_' } } });
  console.log(`剩余 df_ 占位账号: ${left} 个${left ? '（沈苏洋 df_3d1d39e137119be1 等，待真实 UID）' : ''}`);
  console.log(DRY_RUN ? 'dry-run 完成，未写库' : '回填完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
