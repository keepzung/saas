#!/usr/bin/env node
// 临时校验：抽查 brand10/11 mock 改写结果 + 宠物素材 + 断言无车词（跑完可删）
const path = require('path');
const { createRequire } = require('module');
const ROOT = '/opt/saas';
const req = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient();
// brand11（宠物区）禁词：车/辆 + 一切汽车品牌词
const PET_FORBIDDEN = /[辆车]|试驾|4S|提车|交车|续航|东风|日产|奕境|荣威|特斯拉|格力|大众|Morgan|MDD|X9/i;
// brand10（Nissan区）禁词：其他车型/其他品牌词（「东风日产N7」是期望值，不算违禁）
const NISSAN_FORBIDDEN = /奕境|变境|奕炫|风神|皓极|皓瀚|纳米|猛士|俊风|荣威|特斯拉|格力|大众|Morgan|MDD|X9/i;

(async () => {
  const notes = await p.koxNote.findMany({ where: { brandId: 11 }, select: { title: true, authorName: true, category: true, topics: true, coverUrl: true, content: true }, take: 6 });
  const accs = await p.kosAccount.findMany({ where: { brandId: 11 }, select: { nickname: true, storeName: true, regionName: true }, take: 5 });
  const dealers11 = await p.koxDealerSnapshot.findMany({ where: { brandId: 11 }, select: { dealerName: true }, take: 4 });
  const dealers10 = await p.koxDealerSnapshot.findMany({ where: { brandId: 10 }, select: { dealerName: true }, take: 4 });
  const n10 = await p.koxNote.findMany({ where: { brandId: 10 }, select: { title: true, content: true, coverUrl: true }, take: 3 });
  const mv = await p.materialVideo.count({ where: { brandId: 11 } });
  const mi = await p.materialImage.count({ where: { brandId: 10 } });
  const quota11 = await p.brandQuota.findUnique({ where: { brandId: 11 } });

  console.log('=== brand11 笔记（标题|作者|品类|话题|封面）===');
  notes.forEach((n) => console.log(`${n.title} | ${n.authorName} | ${n.category} | ${JSON.stringify(n.topics)} | ${(n.coverUrl || '').slice(0, 48)}`));
  console.log('=== brand11 账号 ===');
  accs.forEach((a) => console.log(`${a.nickname} | ${a.storeName} | ${a.regionName}`));
  console.log('=== brand11 经销商 ===');
  dealers11.forEach((d) => console.log(d.dealerName));
  console.log('=== brand10 经销商 ===');
  dealers10.forEach((d) => console.log(d.dealerName));
  console.log('=== brand10 笔记标题||正文前80 ===');
  n10.forEach((n) => console.log(`${n.title} || ${(n.content || '').slice(0, 80).replace(/\n/g, ' ')}`));
  console.log(`=== 素材: brand10 图片 ${mi} 张 / brand11 视频 ${mv} 条 / quota11 total=${quota11?.total}`);

  let bad = 0;
  const all11 = await p.koxNote.findMany({ where: { brandId: 11 }, select: { id: true, title: true, content: true, authorName: true, topics: true } });
  for (const n of all11) {
    for (const v of [n.title, n.content, n.authorName, ...(n.topics ?? [])]) {
      if (typeof v === 'string' && PET_FORBIDDEN.test(v)) { bad += 1; if (bad < 10) console.log('⛔11', n.id, String(v).slice(0, 50)); }
    }
  }
  const all10 = await p.koxNote.findMany({ where: { brandId: 10 }, select: { id: true, title: true } });
  for (const n of all10) {
    if (NISSAN_FORBIDDEN.test(n.title)) { bad += 1; if (bad < 20) console.log('⛔10', n.id, n.title.slice(0, 50)); }
  }
  const acc11 = await p.kosAccount.findMany({ where: { brandId: 11 }, select: { nickname: true, storeName: true, accountTag: true, operatorName: true } });
  for (const a of acc11) {
    for (const v of [a.nickname, a.storeName, a.accountTag, a.operatorName]) {
      if (typeof v === 'string' && PET_FORBIDDEN.test(v)) { bad += 1; console.log('⛔11acc', v.slice(0, 40)); }
    }
  }
  const cats = await p.koxNote.groupBy({ by: ['category'], where: { brandId: 11 }, _count: { _all: true } });
  console.log('=== brand11 品类分布 ===', JSON.stringify(cats.map((c) => [c.category, c._count._all])));
  const tokens = new Map();
  const re = /[A-Za-z]+[0-9]+|奕|境|变|风神|纳米|猛士/gi;
  for (const n of all10) for (const m of String(n.title).match(re) ?? []) tokens.set(m, (tokens.get(m) ?? 0) + 1);
  console.log('=== brand10 标题车型词形扫描 ===', JSON.stringify([...tokens.entries()]));
  console.log(bad ? `⛔ 断言失败 ${bad} 处` : '✅ 抽查断言通过（宠物区无车词 / Nissan区无其他车型词）');
  await p.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
