#!/usr/bin/env node
// P2.2 crontab 生成器:从 deploy/jobs.yaml 生成 root/deploy 两份 crontab。
// 默认 dry-run:生成内容与线上比对并报告漂移(等价证明);--apply 才真正安装,
// 安装前自动把线上旧表备份到 deploy/crontab-backup-<user>-<时间戳>。
// 需在服务器以 root 运行。用法: node install-crontab.cjs [--apply] [--yaml=deploy/jobs.yaml]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createRequire } = require('module');

const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const yaml = backendRequire('js-yaml');

const argVal = (k) => {
  const i = process.argv.indexOf(k);
  if (i > -1) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  return eq ? eq.slice(k.length + 1) : null;
};
const APPLY = process.argv.includes('--apply');
const ROOT_DIR = path.join(__dirname, '..');
const YAML_FILE = argVal('--yaml') || path.join(ROOT_DIR, 'deploy', 'jobs.yaml');

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const liveCrontab = (user) => {
  try {
    return execSync(`crontab -l -u ${user} 2>/dev/null`, { encoding: 'utf8' });
  } catch {
    return '';
  }
};

const doc = yaml.load(fs.readFileSync(YAML_FILE, 'utf8'));
const byUser = {};
for (const job of doc.jobs || []) {
  const schedules = Array.isArray(job.schedule) ? job.schedule : [job.schedule];
  for (const s of schedules) {
    (byUser[job.user] ||= []).push(`${s} ${job.line}`);
  }
}

let anyDiff = false;
for (const user of doc.meta?.crontab_users || ['root', 'deploy']) {
  const generated = (byUser[user] || []).map(norm).join('\n') + '\n';
  const genFile = path.join(ROOT_DIR, 'deploy', `crontab-${user}.generated`);
  fs.writeFileSync(genFile, generated);

  const liveRaw = liveCrontab(user);
  const liveSet = new Set(liveRaw.split(/\r?\n/).map(norm).filter(Boolean));
  const genSet = new Set(generated.split(/\r?\n/).map(norm).filter(Boolean));
  const missingOnServer = [...genSet].filter((l) => !liveSet.has(l));
  const extraOnServer = [...liveSet].filter((l) => !genSet.has(l));

  console.log(`\n== ${user} ==  生成 ${genSet.size} 行 · 线上 ${liveSet.size} 行 · 差异 ${missingOnServer.length + extraOnServer.length}`);
  for (const l of missingOnServer) console.log(`  + 清单有·线上缺: ${l}`);
  for (const l of extraOnServer) console.log(`  - 线上有·清单缺: ${l}`);
  if (missingOnServer.length || extraOnServer.length) anyDiff = true;

  if (APPLY) {
    if (liveRaw.trim()) {
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const backup = path.join(ROOT_DIR, 'deploy', `crontab-backup-${user}-${ts}`);
      fs.writeFileSync(backup, liveRaw);
      console.log(`  备份旧表 → deploy/crontab-backup-${user}-${ts}`);
    }
    const tmp = path.join('/tmp', `crontab-install-${user}`);
    fs.writeFileSync(tmp, generated);
    execSync(`crontab -u ${user} ${tmp}`);
    const after = liveCrontab(user);
    const afterSet = new Set(after.split(/\r?\n/).map(norm).filter(Boolean));
    const ok = genSet.size === afterSet.size && [...genSet].every((l) => afterSet.has(l));
    console.log(`  ${ok ? '✅ 已安装并复核一致' : '✗ 安装后复核不一致!'}`);
    if (!ok) process.exit(2);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] 未改动线上。确认差异符合预期后加 --apply 安装(自动备份旧表)。`);
} else {
  console.log(`\n[apply] 安装完成。回滚: crontab -u <user> deploy/crontab-backup-<user>-<ts>`);
}
process.exit(APPLY && anyDiff ? 0 : anyDiff ? 1 : 0);
