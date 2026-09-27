// 探测旧系统（pyapi.gartech.cc）素材图片/创作策略/Skills 端点
const { makeClient } = require('./client.cjs');

const CANDIDATES = [
  // 素材图片
  ['/materialimagelist', { page_size: 5 }],
  ['/materialimage/list', { page_size: 5 }],
  ['/material/list', { page_size: 5 }],
  ['/materialimagesetdetail', { id: 6 }],
  ['/materialimageset/itemlist', { set_id: 6 }],
  ['/materialitemlist', { page_size: 5 }],
  ['/media/list', { page_size: 5 }],
  ['/materialimagesetpage', { page_size: 5 }],
  ['/materialpage', { page_size: 5 }],
  ['/material/listpage', { page_size: 5 }],
  // 创作策略（writing logic）
  ['/writinglogiclist', {}],
  ['/writinglogic/list', {}],
  ['/writing-logic/list', {}],
  ['/writinglogics', {}],
  ['/strategy/list', {}],
  ['/strategylist', {}],
  ['/writing/strategy/list', {}],
  ['/createstrategy/list', {}],
  // Skills
  ['/skillslist', {}],
  ['/skills/list', {}],
  ['/skill/list', {}],
];

(async () => {
  const c = makeClient(867, 14);
  await c.init();
  for (const [p, q] of CANDIDATES) {
    try {
      const j = await c.get(p, q);
      const brief = JSON.stringify(j)?.slice(0, 220);
      console.log(`${p} => ${brief}`);
    } catch (e) {
      console.log(`${p} => ERR ${e.message}`);
    }
  }
})();
