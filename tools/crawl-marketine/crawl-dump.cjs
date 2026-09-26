// 旧系统（marketine.cn / pyapi.gartech.cc）真实数据抓取落盘
// 用法: node crawl-dump.cjs            # 抓 东风奕境(867/brand14) + 格力(869/brand17)
// 输出: dumps/<companyId>/<name>.json
const fs = require('fs');
const path = require('path');
const { makeClient } = require('./client.cjs');

const TARGETS = [
  { companyId: 867, brandId: 14, name: 'dongfeng' },
  { companyId: 869, brandId: 17, name: 'gree' },
];
const DUMP_DIR = path.join(__dirname, 'dumps');

const save = (company, name, data) => {
  const dir = path.join(DUMP_DIR, String(company));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 1));
  console.log(`  saved ${name}.json`);
};

/** 分页拉全（响应形如 {code:100,data:{list,total,page,...}} 或 {data:[...]}） */
async function fetchAll(c, p, query, pageKey = 'page', sizeKey = 'page_size', maxPages = 100) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const j = await c.get(p, { ...query, [pageKey]: page, [sizeKey]: 100 });
    const d = j?.data;
    if (!d) break;
    const list = Array.isArray(d) ? d : d.list;
    if (!list || !list.length) break;
    out.push(...list);
    const total = Array.isArray(d) ? list.length : d.total ?? out.length;
    if (out.length >= total || list.length < 100) break;
  }
  return out;
}

async function crawl({ companyId, brandId, name }) {
  console.log(`===== ${name} company=${companyId} brand=${brandId} =====`);
  const c = makeClient(companyId, brandId);
  await c.init();

  const users = await fetchAll(c, '/user/list');
  save(companyId, 'users', users);

  const j = await c.get('/brand/myList');
  save(companyId, 'brands', j.data);

  const pool = await c.get('/brand/userPool', { brandId, roleKey: 'agency_manager' }).catch(() => null);
  if (pool?.code === 100) save(companyId, 'userPool-agency_manager', pool.data);

  const member = await c.get('/brandMember/list', { brandId }).catch(() => null);
  if (member?.code === 100) save(companyId, 'brandMembers', member.data);

  for (const [key, p, q] of [
    ['products', '/products', { brandId }],
    ['material-type-tags', '/materialtypetaglist', { page_size: 200 }],
    ['material-image-sets', '/materialimagesetlist', { page_size: 200 }],
    ['campaign-packages', '/campaign/packages', { pageSize: 100 }],
    ['campaign-simple-packages', '/campaign/simple-packages', { pageSize: 100 }],
    ['campaign-package-options', '/campaign/package-options', {}],
    ['history-xhs', '/history/xhs', {}],
    ['batch-tasks', '/batch-tasks', {}],
  ]) {
    try {
      const r = await c.get(p, q);
      const bare = Array.isArray(r) || (r && !('code' in r) && typeof r === 'object');
      if (bare) save(companyId, key, r);
      else if (r?.code === 100 && r.data != null) save(companyId, key, r.data);
      else console.log(`  skip ${key}: ${JSON.stringify(r).slice(0, 80)}`);
    } catch (e) {
      console.log(`  fail ${key}: ${e.message.slice(0, 80)}`);
    }
  }

  // 包内素材明细
  const pkgs = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, String(companyId), 'campaign-packages.json'), 'utf8'));
  const pkgList = Array.isArray(pkgs) ? pkgs : pkgs.list ?? [];
  const details = [];
  for (const pkg of pkgList.slice(0, 50)) {
    const id = pkg.id ?? pkg.package_id;
    if (!id) continue;
    const r = await c.get('/campaign/packages/materials', { package_id: id, pageSize: 100 }).catch((e) => ({ err: e.message }));
    details.push({ package_id: id, resp: r });
  }
  if (details.length) save(companyId, 'campaign-package-materials', details);

  // 任务系统
  try {
    const tasks = await fetchAll(c, '/kos/content_task_list', {}, 'page', 'page_size');
    save(companyId, 'content-tasks', tasks);
    const details = [];
    for (const t of tasks.slice(0, 50)) {
      const id = t.id ?? t.task_id;
      if (!id) continue;
      const detail = await c.get('/kos/content_task_detail', { task_id: id }).catch((e) => ({ err: e.message }));
      const contents = await c.get('/kos/content_task_content_list', { task_id: id }).catch((e) => ({ err: e.message }));
      const progress = await c.get('/kos/content_task_account_progress', { task_id: id }).catch((e) => ({ err: e.message }));
      details.push({ task_id: id, detail, contents, progress });
    }
    if (details.length) save(companyId, 'content-task-details', details);
  } catch (e) {
    console.log(`  tasks fail: ${e.message.slice(0, 100)}`);
  }
}

(async () => {
  for (const t of TARGETS) {
    await crawl(t);
  }
  console.log('done');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
