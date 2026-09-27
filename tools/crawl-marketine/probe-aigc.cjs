// 探测 /aigc/* 真实响应结构（东风 867/brand 14）
const { makeClient } = require('./client.cjs');

(async () => {
  const c = makeClient(867, 14);
  await c.init();
  const show = (label, j, n = 500) => console.log(`\n### ${label}\n${JSON.stringify(j)?.slice(0, n)}`);

  show('materiallistnew', await c.get('/aigc/materiallistnew', { page: 1, page_size: 3 }).catch((e) => ({ err: e.message })), 900);
  show('materiallist', await c.get('/aigc/materiallist', { page: 1, pageSize: 3 }).catch((e) => ({ err: e.message })), 900);
  show('materialrandomimages', await c.get('/aigc/materialrandomimages', { product_id: 78, num: 3 }).catch((e) => ({ err: e.message })), 600);
  show('materialconfiglist', await c.get('/aigc/materialconfiglist').catch((e) => ({ err: e.message })), 600);
  show('materialtemplatelist', await c.get('/aigc/materialtemplatelist', {}).catch((e) => ({ err: e.message })), 600);
  show('materialtaglist', await c.get('/aigc/materialtaglist', {}).catch((e) => ({ err: e.message })), 600);
  show('configbyproductid', await c.get('/aigc/configbyproductid', { product_id: 78 }).catch((e) => ({ err: e.message })), 900);
  show('xhs-history', await c.get('/aigc/xiaohongshu-all/xhs-history', { page: 1, page_size: 2 }).catch((e) => ({ err: e.message })), 600);
})();
