// 端点探测：以指定公司身份批量 GET 候选路径，输出 code + 数据形状
// 用法: node probe.cjs <companyId> [path1 path2 ...]
const fs = require('fs');
const path = require('path');
const { makeClient } = require('./client.cjs');

const companyId = Number(process.argv[2] || 867);
const candidates = process.argv.slice(3);
const DEFAULTS = [
  '/brand/myList',
  '/user/info',
  '/user/list',
  '/kox/accounts',
  '/kos/accounts',
  '/kox/monitor/list',
  '/monitor/list',
  '/kox/overview',
  '/kox/ranking',
  '/kox/notes',
  '/kos/notes',
  '/kox/tasks',
  '/kos/task/list',
  '/kox/task/list',
  '/kox_df/accounts',
  '/campaign/plans',
  '/hot-posts',
  '/history/xhs',
  '/products',
  '/materialtypetaglist',
  '/materialimagesetlist',
  '/campaign/packages',
  '/batch-tasks',
  '/writinglogic/list',
  '/writing-logic/list',
  '/aigc/configlist',
  '/access/policy',
  '/brandMember/list',
];

const list = candidates.length ? candidates : DEFAULTS;

(async () => {
  const c = makeClient(companyId);
  await c.init();
  console.log(`== login ok as company ${companyId}, /user/info above ==`);
  for (const p of list) {
    try {
      const j = await c.get(p, { page: 1, page_size: 5 });
      const shape = summarize(j);
      console.log(`${String(j.code).padEnd(6)} ${p.padEnd(34)} ${shape}`);
    } catch (e) {
      console.log(`ERR    ${p.padEnd(34)} ${e.message.slice(0, 90)}`);
    }
  }
})();

function summarize(j) {
  if (j == null) return 'null';
  if (j.code !== undefined && j.code !== 100) return `code=${j.code} ${String(j.msg ?? '').slice(0, 40)}`;
  const d = j.data;
  if (d == null) return 'code=100 data=null';
  if (Array.isArray(d)) return `code=100 array[${d.length}] sample=${JSON.stringify(d[0]).slice(0, 120)}`;
  if (typeof d === 'object') {
    const keys = Object.keys(d).slice(0, 10).join(',');
    const inner = d.list !== undefined ? ` list[${d.list.length}]/${d.total}` : '';
    return `code=100 obj{${keys}}${inner}`;
  }
  return `code=100 ${String(d).slice(0, 80)}`;
}
