// 一次性：特斯拉基线账号标签/门店更新（tesla/标签更新1013.xlsx 账号信息 sheet）+ 新增「卖特斯拉的小百合」
// 数据源：/tmp/tags-1013.json（xlsx 账号信息 sheet 导出，211 行）
const { PrismaClient } = require('/opt/saas/backend/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
const incoming = JSON.parse(fs.readFileSync('/tmp/tags-1013.json', 'utf8'));
const esc = (s) => JSON.stringify(s).replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

(async () => {
  const kos = await p.kosAccount.findMany({
    where: { brandId: 6 },
    select: { id: true, authorId: true, nickname: true, accountTag: true, storeName: true, regionName: true, status: true },
  });
  const byUid = new Map(kos.filter((k) => k.authorId).map((k) => [k.authorId, k]));
  const byNick = new Map(kos.map((k) => [k.nickname, k]));

  let tagUp = 0, storeUp = 0, skippedAmbiguous = [];
  const clean = (s) => String(s ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(' / ');
  for (const r of incoming) {
    const k = byUid.get(r.uid) ?? byNick.get(r.name);
    if (!k) continue;
    const data = {};
    if ((k.accountTag ?? '') !== r.tag) { data.accountTag = r.tag; tagUp += 1; }
    const storeClean = clean(r.store);
    if (storeClean && storeClean !== (k.storeName ?? '')) {
      // 门店值内含多行（如 "漳州TC / 厦门海沧特斯拉中心"）视为歧义，本次跳过、仅记录
      if (String(r.store ?? '').includes('\n') || String(r.store ?? '').split('\n').length > 1 || / 夂 /.test('')) {
        if (storeClean.split(' / ').length > 1) { skippedAmbiguous.push({ nick: k.nickname, val: storeClean }); continue; }
      }
      if ((k.storeName ?? '') !== storeClean) { data.storeName = storeClean; storeUp += 1; }
    }
    if (Object.keys(data).length) {
      await p.kosAccount.update({ where: { id: k.id }, data });
      console.log('UPD', esc(k.nickname), JSON.stringify(Object.keys(data)), '->', JSON.stringify({ tag: data.accountTag, store: data.storeName }));
    }
  }
  console.log('tag updates:', tagUp, ' store updates:', storeUp, ' skipped ambiguous:', skippedAmbiguous.length,
    skippedAmbiguous.map((s) => esc(s.nick) + '=' + esc(s.val)).join(','));

  // 新增基线账号（文件中有、基线无）
  const newAcc = incoming.find((r) => !byUid.has(r.uid) && !byNick.has(r.name));
  if (newAcc) {
    const created = await p.kosAccount.create({
      data: {
        brandId: 6,
        authorId: newAcc.uid,
        nickname: newAcc.name,
        accountTag: newAcc.tag,
        storeName: clean(newAcc.store) || null,
        regionName: newAcc.region || null,
        accountType: 'KOS',
        platform: 'xhs',
        status: 'enabled',
        fans: 0,
      },
    });
    console.log('CREATED baseline account: id=', created.id, ' nick=', esc(created.nickname), ' uid=', created.authorId, ' tag=', esc(created.accountTag ?? ''), ' store=', esc(created.storeName ?? ''), ' region=', esc(created.regionName ?? ''));
  }

  // 更新后分布核对
  const dist = await p.kosAccount.groupBy({ by: ['accountTag'], where: { brandId: 6, status: 'enabled' }, _count: true });
  console.log('new tag distribution:', JSON.stringify(dist.map((d) => ({ tag: d.accountTag, n: d._count }))));
  const total = await p.kosAccount.count({ where: { brandId: 6, status: 'enabled' } });
  console.log('enabled baseline total:', total);
  await p.$disconnect();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
