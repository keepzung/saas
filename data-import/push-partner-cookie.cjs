// 将本地人工登录的 partner 会话（tools/spark/state/partner-state-latest.json）推送为
// SparkOrgConfig.cookie（brandId=6），本地+生产同步刷新
// 用法: node push-partner-cookie.cjs [--api https://...]（生产推送经 ssh 由外层完成，本脚本默认本地）
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const stateFile = path.resolve(__dirname, '..', 'tools', 'spark', 'state', 'partner-full', 'partner-state-latest.json');
  if (!fs.existsSync(stateFile)) { console.error('缺 partner-state-latest.json'); process.exit(1); }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const cookies = (state.cookies ?? []).filter((c) => /xiaohongshu\.com$/.test(c.domain));
  if (!cookies.length) { console.error('state 中无 xiaohongshu cookie'); process.exit(1); }
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  console.log(`cookie 条数: ${cookies.length}，串长度: ${cookieStr.length}`);
  await prisma.sparkOrgConfig.update({ where: { brandId: 6 }, data: { cookie: cookieStr } });
  console.log('本地 SparkOrgConfig.cookie 已更新（brandId=6）');
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
