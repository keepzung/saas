// 授予用户「AI 生图每日限额设置」权限（User.actions 推入 ai_poster_limit_set，幂等）
// 用法: node grant-ai-poster-limit-set.cjs [userId]   （默认 1852 = 格力许林）
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

const ACTION = 'ai_poster_limit_set';
const userId = Number(process.argv[2] ?? 1852);

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, role: true, actions: true } });
    if (!user) throw new Error(`用户 ${userId} 不存在`);
    if (user.role === 'ADMIN') {
      console.log(`用户 ${userId}(${user.nickname}) 是 ADMIN，天然有权限，无需授予`);
      return;
    }
    if ((user.actions ?? []).includes(ACTION)) {
      console.log(`用户 ${userId}(${user.nickname}) 已有权限，跳过`);
      return;
    }
    await prisma.user.update({ where: { id: userId }, data: { actions: { push: ACTION } } });
    console.log(`granted ${ACTION} → user ${userId}(${user.nickname})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('grant failed:', e.message || e);
  process.exit(1);
});
