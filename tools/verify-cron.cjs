#!/usr/bin/env node
// P2.1 调度收敛校验:服务器两份 crontab(root/deploy)与 deploy/jobs.yaml 清单逐行比对,漂移≠0 退出码 1。
// 需在服务器以 root 运行(读两个用户的 crontab);空白归一化后比对,双空格/换行差异不算漂移。
// 用法: node verify-cron.cjs [--yaml=/opt/saas/deploy/jobs.yaml] [--json]
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
const YAML_FILE = argVal('--yaml') || path.join(__dirname, '..', 'deploy', 'jobs.yaml');
const outJson = process.argv.includes('--json');

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const liveCrontab = (user) => {
  try {
    return execSync(`crontab -l -u ${user} 2>/dev/null`, { encoding: 'utf8' });
  } catch {
    return '';
  }
};

const doc = yaml.load(fs.readFileSync(YAML_FILE, 'utf8'));
const expected = new Map(); // normalized line -> [jobId]
for (const job of doc.jobs || []) {
  const schedules = Array.isArray(job.schedule) ? job.schedule : [job.schedule];
  for (const s of schedules) {
    const line = norm(`${s} ${job.line}`);
    expected.set(line, [...(expected.get(line) || []), job.id]);
  }
}

const live = new Map(); // normalized line -> raw line
for (const user of doc.meta?.crontab_users || ['root', 'deploy']) {
  for (const raw of liveCrontab(user).split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    live.set(norm(t), { user, raw: t });
  }
}

const drift = [];
for (const [line, ids] of expected) {
  if (!live.has(line)) drift.push({ kind: '清单有·线上缺', jobs: ids.join(','), line });
}
for (const [line, meta] of live) {
  if (!expected.has(line)) drift.push({ kind: '线上有·清单缺', jobs: `${meta.user} crontab`, line: meta.raw });
}

if (outJson) {
  console.log(JSON.stringify({ ok: drift.length === 0, expected: expected.size, live: live.size, drift }, null, 2));
} else {
  console.log(`调度清单校验: 清单 ${expected.size} 行 · 线上 ${live.size} 行 · 漂移 ${drift.length}`);
  if (drift.length) {
    for (const d of drift) console.log(`  ✗ [${d.kind}] (${d.jobs}) ${d.line}`);
    console.log('处置: 以线上为准回填清单,或以清单为准修正 crontab——两处必须一致后再提交');
  } else {
    console.log('✅ 零漂移:清单=线上实况');
  }
}
process.exit(drift.length ? 1 : 0);
