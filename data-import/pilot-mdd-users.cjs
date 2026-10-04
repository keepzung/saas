// MorganDaDa 21 矩阵账号 → 4级账号开通试点（走 /user/manage/batch API，等价于前端批量导入）
// 手机号=登录账号；密码=Mdd@手机号后4位；组织=门店(L3)；绑定 KosAccount（平台实际昵称）
// 用法: node pilot-mdd-users.cjs [--api http://localhost:3000/api/agency-api]
//   生产: PILOT_ADMIN_USER=18510234580 PILOT_ADMIN_PASSWORD=*** node pilot-mdd-users.cjs
const crypto = require('crypto');

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const API = arg('--api', 'http://localhost:3000/api/agency-api');
const BRAND = 5;
const ADMIN_USER = process.env.PILOT_ADMIN_USER || '18600104701';
const ADMIN_PASS = process.env.PILOT_ADMIN_PASSWORD || 'yoyo0508';
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

// (手机号, 昵称=KosAccount 当前昵称, 门店)
const ROWS = [
  ['17799861580', 'MorganDaDa北京SKP', '北京SKP'],
  ['19157604717', 'MorganDaDa北京SKP-小云', '北京SKP'],
  ['19357690992', 'MorganDaDa北京SKP-小静', '北京SKP'],
  ['19357087934', 'MorganDaDa成都SKP', '成都SKP'],
  ['19357126256', 'MorganDaDa成都skp-燕燕', '成都SKP'],
  ['19357219799', 'MorganDaDa成都SKP-静静', '成都SKP'],
  ['17799807107', 'MorganDaDa南京德基店', '南京德基店'],
  ['17714384191', 'MorganDaDa南京德基店- Eileen', '南京德基店'],
  ['19357512668', 'Morgandada南京德基-胡胡', '南京德基'],
  ['19975377903', 'MorganDaDa西安SKP', '西安SKP'],
  ['19157636648', 'MorganDaDa西安SKP-闪闪', '西安SKP'],
  ['18129931582', 'MorganDaDa深圳万象城', '深圳万象城'],
  ['17724635578', 'MorganDaDa深圳万象城-小青', '深圳万象城'],
  ['19357562399', 'MorganDaDa深圳罗湖万象城-雯雯', '深圳万象城'],
  ['19357594002', 'MorganDaDa杭州大厦', '杭州大厦'],
  ['19357637817', 'MorganDaDa杭州大厦-七月', '杭州大厦'],
  ['15355494362', 'MorganDaDa杭州大厦-朱朱', '杭州大厦'],
  ['19357209033', 'MorganDaDa武商MALL', '武商MALL'],
  ['15872421228', 'MorganDaDa武商MALL-李李', '武商MALL'],
  ['13638699980', 'MorganDaDa武商MALL-莎莎', '武商MALL'],
  ['15001945846', 'MorganDaDa上海久光百货', '上海久光'],
];

(async () => {
  // KOS 内容生产模块模板：按 path 动态解析（本地/prod 的 feature id 可能不同）
  const KOS_PATHS = new Set([
    '/kox_task/content-task/task-list',
    '/content-pro/content-factory/xhs-image-text-single',
    '/content-pro/history',
  ]);

  // 管理员登录
  let r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: sha1(ADMIN_PASS) }),
  });
  let j = await r.json();
  if (j.code === 10015) {
    r = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: sha1(ADMIN_PASS), main_company_id: String(BRAND) }),
    });
    j = await r.json();
  }
  const token = j.data?.token;
  if (!token) { console.error('管理员登录失败', JSON.stringify(j).slice(0, 200)); process.exit(1); }

  // 解析 KOS 模板模块 id（菜单树）
  const treeRes = await fetch(`${API}/user/companymodulelist`, { headers: { token } });
  const tree = (await treeRes.json()).data ?? [];
  const kosModuleIds = [];
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.children) walk(n.children);
      else if (n.path && KOS_PATHS.has(n.path) && typeof n.id === 'number') kosModuleIds.push(n.id);
    }
  };
  walk(tree);
  console.log('KOS moduleIds:', kosModuleIds.join(','));

  const rows = ROWS.map(([phone, kosNickname, orgName]) => ({
    phone,
    nickname: kosNickname.split('-').pop().trim(),
    brandRoles: [{ brandId: BRAND, roleKey: 'kos_operator' }],
    orgName,
    kosNickname,
    moduleIds: kosModuleIds,
  }));

  const res = await fetch(`${API}/user/manage/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ rows, passwordPrefix: 'Mdd@' }),
  });
  const out = await res.json();
  if (out.code !== 100) { console.error('批量失败:', JSON.stringify(out).slice(0, 300)); process.exit(1); }
  const d = out.data;
  console.log(`total=${d.total} added=${d.added} updated=${d.updated} failed=${d.failed}`);
  for (const e of d.errors) console.log('  ERR', e.phone, e.reason);
  for (const c of d.credentials) console.log(`  ${c.phone} / ${c.password}  ${c.nickname} [${c.orgName}] -> ${c.kosNickname}`);
  require('fs').writeFileSync(__dirname + '/mdd-credentials.json', JSON.stringify(d.credentials, null, 1));
  console.log('credentials saved -> data-import/mdd-credentials.json');
})().catch((e) => { console.error(e); process.exit(1); });
