#!/usr/bin/env node
// 服务器运行：brand9 东风日产投标区的知识库内容 → brand10 演示区（幂等，可重跑）
//   BrandTemplate(模板库) / KnowledgeRule(知识库规则) / KnowledgeCase(案例库)
// 按 (brandId, kind/name/category, title) 去重；只写 brand10，不碰 brand9。
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
const p = new PrismaClient();
const FROM = 9;
const TO = 10;
const strip = ({ id, createdAt, updatedAt, ...rest }) => rest;

async function copyTemplates() {
  const rows = await p.brandTemplate.findMany({ where: { brandId: FROM } });
  let added = 0;
  for (const r of rows) {
    const dup = await p.brandTemplate.findFirst({ where: { brandId: TO, kind: r.kind, name: r.name } });
    if (dup) continue;
    await p.brandTemplate.create({ data: { ...strip(r), brandId: TO } });
    added += 1;
  }
  console.log(`BrandTemplate: 源 ${rows.length}，新增 ${added}`);
}

async function copyRules() {
  const rows = await p.knowledgeRule.findMany({ where: { brandId: FROM } });
  let added = 0;
  for (const r of rows) {
    const dup = await p.knowledgeRule.findFirst({ where: { brandId: TO, category: r.category, name: r.name } });
    if (dup) continue;
    await p.knowledgeRule.create({ data: { ...strip(r), brandId: TO } });
    added += 1;
  }
  console.log(`KnowledgeRule: 源 ${rows.length}，新增 ${added}`);
}

async function copyCases() {
  const rows = await p.knowledgeCase.findMany({ where: { brandId: FROM } });
  let added = 0;
  for (const r of rows) {
    const dup = await p.knowledgeCase.findFirst({ where: { brandId: TO, category: r.category, title: r.title } });
    if (dup) continue;
    await p.knowledgeCase.create({ data: { ...strip(r), brandId: TO } });
    added += 1;
  }
  console.log(`KnowledgeCase: 源 ${rows.length}，新增 ${added}`);
}

async function main() {
  if (!/\/saas_prod(\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 未指向 saas_prod');
  }
  await copyTemplates();
  await copyRules();
  await copyCases();
  console.log('完成：brand9 知识库内容已同步到 brand10');
}
main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => p.$disconnect());
