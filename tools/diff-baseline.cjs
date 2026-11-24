#!/usr/bin/env node
// 基线快照 diff:架构整理每步的"改前=改后"证明。
// 用法: node diff-baseline.cjs --before=run --after=after [--allow b5-overview-w30,b5-overview-w7]
// allow 列表=声明过的有意变更(如某端点口径对齐),其余任何差异都算失败(退出码 1)。
const fs = require('fs');
const path = require('path');
const argVal = (k) => {
  const i = process.argv.indexOf(k);
  if (i > -1) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  return eq ? eq.slice(k.length + 1) : null;
};
const DIR = path.join(__dirname, '..', argVal('--dir') || 'docs/arch-baseline');
const BEFORE = argVal('--before') || 'before';
const AFTER = argVal('--after') || 'after';
const ALLOW = new Set((argVal('--allow') || '').split(',').map((s) => s.trim()).filter(Boolean));

const stripTag = (f, tag) => f.replace(new RegExp(`-${tag}\\.json$`), '');
const beforeFiles = fs.readdirSync(DIR).filter((f) => f.endsWith(`-${BEFORE}.json`));
let same = 0, changed = [], allowed = [], missingAfter = [];

for (const f of beforeFiles) {
  const stem = stripTag(f, BEFORE);
  const afterFile = `${stem}-${AFTER}.json`;
  const bp = path.join(DIR, f);
  const ap = path.join(DIR, afterFile);
  if (!fs.existsSync(ap)) { missingAfter.push(stem); continue; }
  const b = fs.readFileSync(bp, 'utf8');
  const a = fs.readFileSync(ap, 'utf8');
  if (b === a) same++;
  else if (ALLOW.has(stem)) allowed.push(stem);
  else changed.push(stem);
}

console.log(`基线 diff(before=${BEFORE} after=${AFTER}):`);
console.log(`  一致 ${same}`);
if (allowed.length) console.log(`  有意变更(白名单) ${allowed.length}: ${allowed.join(', ')}`);
if (changed.length) console.log(`  ✗ 意外变更 ${changed.length}:\n    ${changed.join('\n    ')}`);
if (missingAfter.length) console.log(`  ✗ 缺 after 快照 ${missingAfter.length}: ${missingAfter.join(', ')}`);
process.exit(changed.length || missingAfter.length ? 1 : 0);
