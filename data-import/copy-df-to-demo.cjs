#!/usr/bin/env node
// 东风奕境(brandId=7) 业务数据 → 演示工作区（brandId=10 东风日产Nissan / brandId=11 宠物）（幂等，可重跑）
// 用途：Nissan/宠物 两个演示工作区，复制 brand 7 的真实市场数据（账号/笔记/日stat/聚光/员工/专业号/来鼓线索/区域/经销商/洞察）。
// 安全边界（沿用 copy-mdd-to-brand1.cjs 的约定）：
//   - brand 7 全程只读；脚本首尾各做一次 brand 7 全表行数快照并比对，不一致即报错
//   - 所有写入只落在目标 brandId；全局唯一键(authorId/noteId/sessionId/virtualSellerId/vSellerId/commentId)加 nNm_ 前缀防冲突
//   - 不碰同步凭证表(SparkOrgConfig/ProOrgConfig/LaiguOrgConfig)，防止 cron 往演示品牌重复同步
//   - 不碰 KoxRanfDaily(day 全局唯一，复制必冲突)、XhsHistory/内容包/创作任务(业务产出不跨工作区)
//   - 回滚：--clean 按 brandId=TO + nNm_ 前缀清除全部 mock 行
// 与 copy-mdd 的差异 —— 文案改写（「注意单位」需求）：
//   - TO=10（Nissan）：车型词字典改写（奕境→N7 等），笔记封面换成 N7 素材图池，noteUrl 置空
//   - TO=11（宠物）：全部文本字段宠物化重写（标题/昵称/门店/员工/线索话术/品类/话题），
//     封面换宠物图池、头像置空——写库前断言目标文本字段不得含「辆/车/试驾/4S/提车/交车/续航」及任何汽车品牌词
// 用法:
//   node copy-df-to-demo.cjs --to=10 --dry-run           # 只读试跑，打印将复制的行数与改写抽样，不写库
//   node copy-df-to-demo.cjs --to=10                     # 清旧 mock 行 + 全量复制(日常重跑入口，幂等)
//   node copy-df-to-demo.cjs --to=11 --clean             # 仅清除目标品牌 mock 行(回滚)
//   node copy-df-to-demo.cjs --to=10 --align-date 2026-11-20
//       # 演示对齐：把各表日期整体刚性平移，使数据截止日=指定日 00:00（同 copy-mdd-to-brand1）
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

const FROM = 7;
const TO_ARG = (process.argv.find((a) => a.startsWith('--to=')) || '').split('=')[1];
const TO = Number(TO_ARG);
const PREFIX = `n${TO}m_`;
const MODE = TO === 11 ? 'pet' : TO === 10 ? 'nissan' : null;
const DRY_RUN = process.argv.includes('--dry-run');
const CLEAN_ONLY = process.argv.includes('--clean');
const BATCH = 500;

if (!MODE) {
  console.error('用法: node copy-df-to-demo.cjs --to=10|11 [--dry-run] [--clean] [--align-date YYYY-MM-DD]');
  process.exit(1);
}

// ── 素材封面池：从已上传的素材目录取（脚本在服务器 /opt/saas 下运行）────────
function coverPool(relDir) {
  const abs = path.join(ROOT, 'backend', 'uploads', relDir);
  try {
    return fs.readdirSync(abs)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .map((f) => `/uploads/${relDir}/${f}`);
  } catch {
    return [];
  }
}
const NISSAN_COVERS = coverPool('materials/nissan-n7');
const PET_COVERS = coverPool('materials/pet-covers');
if (!DRY_RUN) {
  if (MODE === 'nissan' && !NISSAN_COVERS.length) console.log('⚠ 未找到 Nissan 封面池（backend/uploads/materials/nissan-n7），笔记封面保留原值');
  if (MODE === 'pet' && !PET_COVERS.length) console.log('⚠ 未找到宠物封面池（backend/uploads/materials/pet-covers），笔记封面将置空');
}

// ── 文案改写 ─────────────────────────────────────────────────────────────
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i += 1) h = ((h << 5) - h + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pick = (pool, seed) => pool[hashStr(seed) % pool.length];

const PET_POOLS = {
  noteTitles: [
    '狗狗挑食怎么办？这三招亲测有效', '新手养猫避坑指南｜这5样千万别买', '泰迪掉毛期护理全记录', '猫咪总挠耳朵？小心耳螨作妖',
    '狗狗独自在家的一天｜监控拍下暖心一幕', '幼犬疫苗接种时间表（建议收藏）', '猫粮配方怎么看？教你3秒读懂配料表', '遛狗牵引绳怎么选？实测5款网红款',
    '小猫接回家第一周怎么养', '宠物驱虫药怎么选？体内外一篇讲清', '猫咪应激反应处理手册', '狗狗洗澡频率误区，你中了几条',
    '老年犬关节养护心得分享', '猫抓板哪种耐用？实测对比', '宠物益生菌喂养小知识', '狗狗社交期训练日记',
    '猫咪喝水少？试试这些补水妙招', '幼猫奶糕挑选攻略', '狗狗口臭急救小妙招', '宠物秋季保暖好物合集',
    '猫砂盆除臭大作战', '狗狗疫苗后注意事项', '宠物保险值不值得买？我算了笔账', '比熊泪痕护理一个月对比',
    '狗狗捡食怎么办？纠正训练分享', '猫咪踩奶背后的信号', '新手布偶猫养护踩坑实录', '狗粮测评｜国产进口这样选',
    '猫咪疫苗驱虫年历（附表格）', '带狗露营装备清单', '狗狗关节炎的早期信号', '金毛拆家现场｜精力消耗指南',
    '猫咪减肥计划第7天实录', '仓鼠新手饲养入门', '宠物出行背包怎么选', '狗狗社交训练第一课',
  ],
  contents: [
    '今天分享一个特别实用的小技巧，家里毛孩子有同样情况的可以试试。坚持两周就能看到明显变化，评论区可以交流心得～\n有需要的可以私信我，看到都会回。',
    '整理了很久的养护笔记，都是自己一路踩坑总结出来的经验。新手照着做基本不会出错，建议先收藏再看。\n有问题评论区留言，看到都会回。',
    '这个话题后台问的人很多，今天一次讲清楚。核心就三点：选对产品、控制频率、观察反应。每一点都展开说了，记得看到最后。\n有需要的可以私信我。',
    '记录一下最近的日常，毛孩子们状态都很好。饮食和运动都按计划来的，效果比预期好。\n同款好物放在评论区置顶了。',
    '被问爆的一篇干货来了！其实没有那么复杂，把步骤拆开一步步做就行，新手也能上手。\n觉得有用的话点个赞，评论区可以交流心得～',
    '最近好多朋友私信问我方法，统一回复：关键是坚持和耐心，别指望三天见效。我把完整流程整理在图片里了，照做就行。\n有需要的可以私信我，看到都会回。',
  ],
  topics: [
    ['狗狗日常', '养狗日常', '好物推荐'], ['猫咪日常', '铲屎官日常', '萌宠'], ['宠物美食', '自制宠物粮', '狗狗零食'],
    ['猫粮推荐', '宠物喂养', '新手养猫'], ['狗狗训练', '训犬日记', '萌宠好物'], ['宠物健康', '科学养宠', '养护知识'],
    ['流浪猫救助', '领养代替购买', '猫咪日常'], ['宠物美容', '洗护分享', '泰迪'], ['金毛', '大型犬', '遛狗日常'],
    ['布偶猫', '猫咪好物', '养猫记录'],
  ],
  categories: ['零食安利', '主食测评', '用品好物', '养护知识', '健康科普', '日常Vlog'],
  accountNames: [
    '萌宠日常·栗子妈', '汪汪研究所·阿泽', '猫咪厨房·小鹿', '毛孩子部落·大黄', '爪爪星球·悠悠', '铲屎官联盟·老白',
    '宠物营养师·安然', '狗狗训练营·阿凯', '萌宠日记·小夏', '撸猫日常·奶盖', '遛狗日记·大壮', '宠物美容师·小美',
    '流浪猫救助站·阿云', '柯基屁屁·桃子', '金毛阿福的日常', '猫咪行为师·青禾', '宠物烘焙·糖糖', '狗粮测评员·大熊',
    '猫砂测评官·团子', '萌宠摄影·橘子', '宠物出行·路路', '泰迪卷卷一家', '布偶雪球的日常', '柴犬豆柴兄妹',
    '宠物医生·周周', '训犬师·大川', '兔子部屋·小白', '水族小站·阿蓝', '鹦鹉学舌·花花', '仓鼠金金日常',
    '宠物寄养·安安', '萌宠零食铺·朵拉', '猫咪寄养馆·喵姐', '狗狗幼儿园·园长', '异宠研究所·阿方', '宠物穿搭·可可',
  ],
  storeNames: [
    '萌宠星球生活馆', '爪爪乐园体验店', '毛孩子优选驿站', '汪喵集市旗舰店', '宠物乐园奥莱店', '萌宠小镇体验馆',
    '尾巴摇摇生活馆', '宠物美食工厂店', '喵汪严选万达店', '宠物社区服务站', '爪印咖啡宠物店', '萌宠训练营门店',
    '宠物美容旗舰店', '毛球集市吾悦店', '喵屋猫舍体验店', '汪汪之家服务站', '宠物医院旗舰院区', '萌宠寄养酒店',
    '宠物用品折扣仓', '爪爪星球高新店',
  ],
  staffNames: [
    '小栗', '阿泽', '小鹿', '大黄', '悠悠', '老白', '安然', '阿凯', '小夏', '奶盖', '大壮', '小美',
    '阿云', '桃子', '阿福', '青禾', '糖糖', '大熊', '团子', '橘子', '路路', '卷卷', '雪球', '周周',
  ],
  clientContents: [
    '想问下狗狗零食套餐怎么买', '猫咪挑食有什么办法吗', '幼犬疫苗打完了能洗澡吗', '猫粮可以先拿试吃装吗',
    '狗狗指甲剪总剪不好，有上门服务吗', '宠物美容洗护怎么预约', '猫咪寄养一天多少钱', '小狗咳嗽需要做检查吗',
    '仓鼠用品有新手套餐吗', '三个月幼犬吃什么狗粮好', '猫咪驱虫体内外一起做吗', '狗狗咬家具怎么纠正',
    '预约宠物体检需要带什么', '老年猫需要补充什么营养', '宠物洗牙大概多少钱', '猫抓板有优惠装吗',
    '狗狗游泳课怎么收费', '寄养需要自带粮食吗', '幼猫到家一直叫正常吗', '狗狗美容一次能保持多久',
  ],
  productNames: ['冻干鸡肉粒', '猫粮成猫款', '狗窝四季款', '宠物羊奶粉', '猫咪逗猫棒', '狗狗洁齿骨', '猫砂混合款', '宠物智能饮水机'],
};

// Nissan 车型词字典改写（顺序敏感：先长词后短词；源车型实测为奕境X9系列）
const NISSAN_DICT = [
  [/东风奕境/g, '东风日产'],
  [/奕境X9/gi, '东风日产N7'],
  [/变境X9/gi, '东风日产N7'],
  [/卖境X9/gi, '东风日产N7'],
  [/奕境4S/gi, '东风日产4S'],
  [/变境4S/gi, '东风日产4S'],
  [/奕境/g, 'N7'],
  [/变境/g, 'N7'],
  [/卖境/g, 'N7'],
  [/奕炫/g, 'N7'],
  [/风神/g, '日产'],
  [/皓极/g, 'N7'],
  [/皓瀚/g, 'N7'],
  [/纳米/g, 'N7'],
  [/猛士/g, '日产'],
  [/俊风/g, '日产'],
  [/X9(?![0-9])/gi, 'N7'],
  [/N74S/g, '东风日产4S'],
  // 孤立的「奕」残字（源标题截断/错别字）：后一个字符不是汉字时兜底替换
  [/奕(?![\u4e00-\u9fa5])/g, '东风日产'],
  [/东风(?!日产)/g, '东风日产'],
];
const nissanTr = (s) => (typeof s === 'string' ? NISSAN_DICT.reduce((acc, [re, to]) => acc.replace(re, to), s) : s);

// 写库前断言：目标品牌文本字段禁止出现的词
const PET_FORBIDDEN = /[辆车]|试驾|4S|提车|交车|续航|东风|日产|奕境|荣威|特斯拉|格力|大众|Morgan|MDD/i;
const NISSAN_FORBIDDEN = /奕境|变境|卖境|奕炫|风神|皓极|皓瀚|纳米|猛士|俊风|荣威|特斯拉|格力|大众|Morgan|MDD|X9|N74S/i;
const FORBIDDEN = MODE === 'pet' ? PET_FORBIDDEN : NISSAN_FORBIDDEN;
const violations = [];
function assertClean(label, fields) {
  for (const [f, v] of Object.entries(fields)) {
    if (typeof v === 'string' && FORBIDDEN.test(v)) {
      violations.push(`${label}.${f}: ${v.slice(0, 60)}`);
    } else if (Array.isArray(v)) {
      for (const item of v) if (typeof item === 'string' && FORBIDDEN.test(item)) violations.push(`${label}.${f}: ${item.slice(0, 60)}`);
    }
  }
}

/** 通用文本改写：mode=pet 全部换池；mode=nissan 字典替换 */
function trField(value, pool, seed) {
  if (value == null) return value;
  if (MODE === 'pet') return pool ? pick(pool, seed ?? String(value)) : null;
  return nissanTr(String(value));
}
function trArray(value, pool, seed) {
  if (!Array.isArray(value)) return value;
  if (MODE === 'pet') return pick(pool, seed ?? value.join('|')) ?? [];
  return value.map((v) => nissanTr(String(v)));
}

/** 每张表的文本改写规则：{ field: [pool, seedKey] }；nullOut 数组字段置 null；keep 不动 */
const REWRITE_RULES = {
  kosAccount: {
    tr: {
      nickname: [PET_POOLS.accountNames, 'authorId'],
      storeName: [PET_POOLS.storeNames, 'authorId'],
      accountTag: [PET_POOLS.categories, 'authorId'],
      operatorName: [PET_POOLS.staffNames, 'authorId'],
    },
    nullOut: MODE === 'pet' ? ['avatar', 'operatorMobile', 'storeCode'] : [],
  },
  kosRosterEntry: {
    tr: {
      storeName: [PET_POOLS.storeNames, 'id'],
      mainName: [PET_POOLS.staffNames, 'id'],
      staffName: [PET_POOLS.staffNames, 'id'],
    },
    nullOut: [],
  },
  koxNote: {
    tr: {
      title: [PET_POOLS.noteTitles, 'noteId'],
      content: [PET_POOLS.contents, 'noteId'],
      authorName: [PET_POOLS.accountNames, 'noteId'],
      category: [PET_POOLS.categories, 'noteId'],
      modelTag: [PET_POOLS.productNames, 'noteId'],
      keyword: [['宠物', '萌宠', '养宠'], 'noteId'],
      topics: [PET_POOLS.topics, 'noteId'],
    },
    nullOut: MODE === 'pet' ? ['brandUserName', 'noteUrl'] : ['noteUrl'],
    coverPool: true,
  },
  koxNoteDailyStat: {
    tr: { title: [PET_POOLS.noteTitles, 'noteId'], authorName: [PET_POOLS.accountNames, 'noteId'] },
    nullOut: [],
  },
  koxContentNoteDaily: { tr: { authorName: [PET_POOLS.accountNames, 'noteId'] }, nullOut: [] },
  koxContentStatDaily: { tr: { vSellerName: [PET_POOLS.storeNames, 'vSellerId'] }, nullOut: [] },
  koxJuguangNoteDaily: {
    tr: { title: [PET_POOLS.noteTitles, 'noteId'], creator: [PET_POOLS.accountNames, 'noteId'] },
    nullOut: [],
  },
  koxCampaignDailyStat: {
    tr: { brandUserName: [PET_POOLS.accountNames, 'virtualSellerId'], agentName: [PET_POOLS.storeNames, 'virtualSellerId'] },
    nullOut: ['rawJson'],
  },
  sparkAccount: {
    tr: { name: [PET_POOLS.storeNames, 'virtualSellerId'], agentName: [PET_POOLS.staffNames, 'virtualSellerId'] },
    nullOut: [],
  },
  sparkStaffBrandDaily: { tr: { brandUserName: [PET_POOLS.staffNames, 'brandUserId'] }, nullOut: ['rawJson'] },
  sparkStaffUserDaily: {
    tr: {
      staffName: [PET_POOLS.staffNames, 'userId'],
      nickname: [PET_POOLS.staffNames, 'userId'],
      brandUserName: [PET_POOLS.staffNames, 'brandUserId'],
      staffArea: [PET_POOLS.storeNames, 'userId'],
    },
    nullOut: ['staffLabel'],
  },
  proKosStaff: {
    tr: { nickName: [PET_POOLS.staffNames, 'userId'], realName: [PET_POOLS.staffNames, 'userId'] },
    nullOut: MODE === 'pet' ? ['avatar'] : [],
  },
  laiguLead: {
    tr: {
      staffName: [PET_POOLS.staffNames, 'sessionId'],
      advertiserName: [PET_POOLS.storeNames, 'sessionId'],
      lastClientContent: [PET_POOLS.clientContents, 'sessionId'],
    },
    nullOut: ['tags'],
    keepFields: ['clientName', 'source', 'subSource', 'chatEntry', 'ipLocation'],
  },
  laiguComment: {
    tr: { noteTitle: [PET_POOLS.noteTitles, 'commentId'], content: [PET_POOLS.clientContents, 'commentId'] },
    nullOut: MODE === 'pet' ? ['noteCover', 'entOpenName', 'rawJson'] : ['rawJson'],
    keepFields: ['commentUserName'],
  },
  proClueUserDay: { tr: { belongUserName: [PET_POOLS.staffNames, 'id'], nickName: [PET_POOLS.staffNames, 'id'] }, nullOut: [] },
  clueAnalysisDaily: {
    tr: { subUserName: [PET_POOLS.storeNames, 'id'], proUserName: [PET_POOLS.staffNames, 'id'] },
    nullOut: [],
  },
  clueAcqToolDaily: { tr: { subUserName: [PET_POOLS.storeNames, 'id'] }, nullOut: [] },
  koxRegionAdSnapshot: { tr: {}, nullOut: ['rawJson'] },
  koxDealerSnapshot: { tr: { dealerName: [PET_POOLS.storeNames, 'id'] }, nullOut: ['rawJson'] },
  koxDealerSales: {
    tr: { dealerName: [PET_POOLS.storeNames, 'id'], modelName: [PET_POOLS.productNames, 'id'] },
    nullOut: [],
  },
  koxWeeklySnapshot: {
    tr: {
      accountName: [PET_POOLS.accountNames, 'id'],
      storeName: [PET_POOLS.storeNames, 'id'],
      certifyUser: [PET_POOLS.staffNames, 'id'],
    },
    nullOut: [],
    weeklyUnique: true, // @@unique([brandId, weekStart, accountName]) 改名后防撞
  },
  koxCampaignProject: {
    tr: { name: [PET_POOLS.noteTitles, 'id'], remark: [PET_POOLS.contents, 'id'] },
    nullOut: ['importedStats'],
  },
  insightContent: { tr: { title: [PET_POOLS.noteTitles, 'id'], authorName: [PET_POOLS.accountNames, 'id'] }, nullOut: [] },
  insightReport: { tr: { name: [PET_POOLS.noteTitles, 'id'] }, nullOut: [] },
};

function rewriteRow(model, row) {
  const rule = REWRITE_RULES[model];
  if (!rule) return row;
  const out = { ...row };
  for (const [f, [pool, seedKey]] of Object.entries(rule.tr)) {
    const seed = seedKey ? String(row[seedKey] ?? row.id ?? f) : undefined;
    out[f] = Array.isArray(row[f]) ? trArray(row[f], pool, seed) : trField(row[f], pool, seed);
  }
  for (const f of rule.nullOut) out[f] = null;
  if (rule.coverPool) {
    const pool = MODE === 'pet' ? PET_COVERS : NISSAN_COVERS;
    if (pool.length) out.coverUrl = pick(pool, row.noteId ?? row.id);
    else if (MODE === 'pet') out.coverUrl = null;
  }
  if (rule.weeklyUnique && MODE === 'pet') {
    // weekStart+accountName 唯一：改写后若同周撞名，追加 ·2/·3
    const key = `${out.weekStart?.getTime?.() ?? out.weekStart}|${out.accountName}`;
    const n = (weeklySeen.get(key) ?? 0) + 1;
    weeklySeen.set(key, n);
    if (n > 1) out.accountName = `${out.accountName}·${n}`;
  }
  assertClean(`${model}#${row.id ?? row.noteId ?? row.authorId ?? ''}`, {
    ...Object.fromEntries(Object.keys(rule.tr).map((f) => [f, out[f]])),
    ...(rule.keepFields ? Object.fromEntries(rule.keepFields.map((f) => [f, out[f]])) : {}),
    ...(Array.isArray(out.topics) ? { topics: out.topics } : {}),
  });
  // id 只是断言标签/种子用的注入值，不能进 createMany（自增主键唯一约束）
  delete out.id;
  // 宠物区笔记：源 category 为空导致内容类型图表全空，回填宠物品类（约10%留空保持真实感）
  if (MODE === 'pet' && model === 'koxNote' && !out.category && hashStr(`cat${row.noteId ?? row.id}`) % 100 >= 10) {
    out.category = pick(PET_POOLS.categories, `cat${row.noteId ?? row.id}`);
  }
  return out;
}
const weeklySeen = new Map();

const prisma = new PrismaClient();

const dbLabel = () => {
  const url = process.env.DATABASE_URL || '';
  const m = url.match(/postgresql:\/\/[^@]*@([^/:]+):?\d*\/([^?]+)/);
  return m ? `${m[1]}/${m[2]}` : '(未识别)';
};

/** 去掉自增 id 与时间戳类字段，其余字段原样透传 */
function strip(row) {
  const { id, createdAt, updatedAt, fetchedAt, firstSeenAt, lastSeenAt, ...rest } = row;
  return rest;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── 日期对齐(--align-date YYYY-MM-DD)：冻结快照对齐到演示日 ──────────────
const ALIGN_ARG = (() => {
  const i = process.argv.indexOf('--align-date');
  return i > -1 ? process.argv[i + 1] : null;
})();
const ALIGN_CONFIG = {
  koxNote: { anchor: ['publishTime'], dates: ['publishTime', 'statDate'] },
  koxNoteDailyStat: { anchor: ['day'], dates: ['day'] },
  // koxAccountDailyStat 无 brandId 列且源为 0 行，不进对齐配置
  koxContentNoteDaily: { anchor: ['day'], dates: ['day', 'notePublishTime'] },
  koxContentStatDaily: { anchor: ['day'], dates: ['day'] },
  koxJuguangNoteDaily: { anchor: ['day'], dates: ['day'] },
  koxCampaignDailyStat: { anchor: ['statDate'], dates: ['statDate'] },
  sparkAccount: {
    anchor: ['partnerSnapshotAt', 'lastConsumeDate'], strFields: ['lastConsumeDate'],
    dates: ['partnerSnapshotAt'], strDates: ['lastConsumeDate'],
  },
  sparkStaffBrandDaily: { anchor: ['statDate'], dates: ['statDate'] },
  sparkStaffUserDaily: { anchor: ['statDate'], dates: ['statDate'] },
  proKosOverview: { anchor: ['statDate'], dates: ['statDate', 'startDate', 'endDate'] },
  proKosStaff: { anchor: ['statDate'], dates: ['statDate'] },
  laiguLead: {
    anchor: ['sessionCreatedAt', 'sessionEndedAt', 'firstMessageAt', 'lastMessageAt'],
    dates: ['sessionCreatedAt', 'sessionEndedAt', 'firstMessageAt', 'lastMessageAt'],
  },
  laiguComment: { anchor: ['createdAt'], dates: ['createdAt'] },
  proClueDaily: { anchor: ['day'], dates: ['day'] },
  proClueUserDay: { anchor: ['day'], dates: ['day'] },
  proClueToolStatDaily: { anchor: ['day'], dates: ['day'] },
  clueAnalysisDaily: { anchor: ['day'], dates: ['day'] },
  clueAcqToolDaily: { anchor: ['day'], dates: ['day'] },
  koxDailyStat: { anchor: ['statDate'], dates: ['statDate'] },
  koxRegionAdSnapshot: { anchor: ['statDate'], dates: ['statDate'] },
  koxWeeklySnapshot: { anchor: ['weekStart'], dates: ['weekStart', 'weekEnd'] },
  insightContent: { anchor: ['publishAt'], dates: ['publishAt'] },
  insightDailyStat: { anchor: ['statDate'], dates: ['statDate'] },
};
const ALIGN_SHIFTS = {};
function parseLocalDateStr(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
async function computeAlignShifts(target00) {
  for (const [model, cfg] of Object.entries(ALIGN_CONFIG)) {
    let maxA = null;
    for (const f of cfg.anchor) {
      let v = null;
      if ((cfg.strFields || []).includes(f)) {
        const rows = await prisma[model].findMany({ where: { brandId: FROM }, select: { [f]: true } });
        for (const r of rows) {
          const d = r[f] ? parseLocalDateStr(r[f]) : null;
          if (d && (!maxA || d > maxA)) maxA = d;
        }
        continue;
      }
      const r = await prisma[model].aggregate({ _max: { [f]: true }, where: { brandId: FROM } });
      v = r._max[f];
      if (v && (!maxA || v > maxA)) maxA = v;
    }
    ALIGN_SHIFTS[model] = maxA ? target00.getTime() - maxA.getTime() : 0;
    if (ALIGN_SHIFTS[model] < 0) ALIGN_SHIFTS[model] = 0;
  }
}
function alignRow(model, row) {
  const ms = ALIGN_SHIFTS[model];
  if (!ms) return row;
  const cfg = ALIGN_CONFIG[model];
  for (const f of cfg.dates) if (row[f] instanceof Date) row[f] = new Date(row[f].getTime() + ms);
  for (const f of cfg.strDates || []) {
    if (typeof row[f] === 'string' && /^\d{4}-/.test(row[f])) {
      const d = parseLocalDateStr(row[f]);
      if (d) {
        d.setMilliseconds(d.getMilliseconds() + ms);
        row[f] = d.toISOString().slice(0, 10);
      }
    }
  }
  return row;
}

// ── 需要复制的 brand 7 表清单（含源为 0 的，运行时自动跳过）──
const SNAPSHOT_TABLES = [
  'kosAccount', 'kosRosterEntry', 'koxNote', 'koxNoteDailyStat',
  'koxContentNoteDaily', 'koxContentStatDaily', 'koxJuguangNoteDaily', 'koxCampaignDailyStat',
  'sparkAccount', 'sparkStaffBrandDaily', 'sparkStaffUserDaily', 'proKosOverview', 'proKosStaff',
  'laiguLead', 'laiguComment', 'proClueDaily', 'proClueUserDay', 'proClueToolStatDaily',
  'clueAnalysisDaily', 'clueAcqToolDaily', 'koxDailyStat', 'koxRegionAdSnapshot',
  'koxDealerSnapshot', 'koxDealerSales', 'koxWeeklySnapshot', 'koxCampaignProject',
  'insightContent', 'insightDailyStat', 'insightReport',
];

/** koxAccountDailyStat 无 brandId 列，按账号归属统计 */
async function countAccountDailyStat(brandId) {
  const accounts = await prisma.kosAccount.findMany({ where: { brandId }, select: { id: true } });
  if (!accounts.length) return 0;
  return prisma.koxAccountDailyStat.count({ where: { accountId: { in: accounts.map((a) => a.id) } } });
}

async function snapshotFrom(label) {
  const snap = {};
  for (const t of SNAPSHOT_TABLES) snap[t] = await prisma[t].count({ where: { brandId: FROM } });
  snap.koxAccountDailyStat = await countAccountDailyStat(FROM);
  console.log(`\n[brand ${FROM} 快照] ${label}`);
  for (const [t, n] of Object.entries(snap)) if (n > 0) console.log(`  ${t}: ${n}`);
  return snap;
}

function diffSnapshot(before, after) {
  const diffs = [];
  for (const [t, n] of Object.entries(before)) {
    if (after[t] !== n) diffs.push(`${t}: ${n} → ${after[t]}`);
  }
  return diffs;
}

async function cleanMock() {
  console.log(`\n[清理] 清除 brand ${TO} 既有 mock 行${DRY_RUN ? '（dry-run 跳过）' : ''}`);
  const del = async (model, where, label) => {
    if (DRY_RUN) { console.log(`  ${label}: 将删除`); return; }
    const r = await prisma[model].deleteMany({ where });
    if (r.count) console.log(`  ${label}: 删除 ${r.count} 行`);
  };
  // 先删账号（其 KoxAccountDailyStat/KoxTaskAuthor 级联），再删其余
  const mockAccounts = await prisma.kosAccount.findMany({
    where: { brandId: TO, authorId: { startsWith: PREFIX } }, select: { id: true },
  });
  const ids = mockAccounts.map((a) => a.id);
  if (ids.length) {
    if (DRY_RUN) console.log(`  账号表现日Stat(级联): 将随 ${ids.length} 个 mock 账号删除`);
    else {
      const r = await prisma.koxAccountDailyStat.deleteMany({ where: { accountId: { in: ids } } });
      if (r.count) console.log(`  账号表现日Stat: 删除 ${r.count} 行`);
    }
  }
  await del('kosAccount', ids.length ? { id: { in: ids } } : { brandId: TO, authorId: { startsWith: PREFIX } }, 'KosAccount(mock)');
  await del('kosRosterEntry', { brandId: TO }, 'KosRosterEntry');
  await del('koxNote', { brandId: TO, noteId: { startsWith: PREFIX } }, 'KoxNote(mock)');
  await del('koxNoteDailyStat', { brandId: TO }, 'KoxNoteDailyStat');
  await del('koxContentNoteDaily', { brandId: TO }, 'KoxContentNoteDaily');
  await del('koxContentStatDaily', { brandId: TO }, 'KoxContentStatDaily');
  await del('koxJuguangNoteDaily', { brandId: TO }, 'KoxJuguangNoteDaily');
  await del('koxCampaignDailyStat', { brandId: TO }, 'KoxCampaignDailyStat');
  await del('sparkAccount', { brandId: TO, virtualSellerId: { startsWith: PREFIX } }, 'SparkAccount(mock)');
  await del('sparkStaffBrandDaily', { brandId: TO }, 'SparkStaffBrandDaily');
  await del('sparkStaffUserDaily', { brandId: TO }, 'SparkStaffUserDaily');
  await del('proKosOverview', { brandId: TO }, 'ProKosOverview');
  await del('proKosStaff', { brandId: TO }, 'ProKosStaff');
  await del('laiguLead', { brandId: TO, sessionId: { startsWith: PREFIX } }, 'LaiguLead(mock)');
  await del('laiguComment', { brandId: TO }, 'LaiguComment');
  await del('proClueDaily', { brandId: TO }, 'ProClueDaily');
  await del('proClueUserDay', { brandId: TO }, 'ProClueUserDay');
  await del('proClueToolStatDaily', { brandId: TO }, 'ProClueToolStatDaily');
  await del('clueAnalysisDaily', { brandId: TO }, 'ClueAnalysisDaily');
  await del('clueAcqToolDaily', { brandId: TO }, 'ClueAcqToolDaily');
  await del('koxDailyStat', { brandId: TO }, 'KoxDailyStat');
  await del('koxRegionAdSnapshot', { brandId: TO }, 'KoxRegionAdSnapshot');
  await del('koxDealerSnapshot', { brandId: TO }, 'KoxDealerSnapshot');
  await del('koxDealerSales', { brandId: TO }, 'KoxDealerSales');
  await del('koxWeeklySnapshot', { brandId: TO }, 'KoxWeeklySnapshot');
  await del('koxCampaignProject', { brandId: TO }, 'KoxCampaignProject(账号子表级联)');
  await del('insightContent', { brandId: TO }, 'InsightContent');
  await del('insightDailyStat', { brandId: TO }, 'InsightDailyStat');
  await del('insightReport', { brandId: TO }, 'InsightReport');
}

async function insertMany(model, rows, label) {
  if (!rows.length) { console.log(`  ${label}: 源 0 行，跳过`); return 0; }
  if (DRY_RUN) { console.log(`  ${label}: 将复制 ${rows.length} 行`); return rows.length; }
  let done = 0;
  for (const c of chunk(rows, BATCH)) {
    await prisma[model].createMany({ data: c });
    done += c.length;
  }
  console.log(`  ${label}: 已写入 ${done} 行`);
  return done;
}

/** 通用复制：fetch → rewrite → align → createMany（brandId 直接换） */
async function copyBrandScoped(model, label) {
  const rows = await prisma[model].findMany({ where: { brandId: FROM } });
  const mapped = rows.map((r) => {
    const { id, ...rest } = strip(r);
    const out = alignRow(model, rewriteRow(model, { ...rest, id: r.id }));
    delete out.id;
    return { ...out, brandId: TO };
  });
  await insertMany(model, mapped, label);
}

async function copyAll() {
  console.log(`\n[复制] brand ${FROM} → brand ${TO}（${MODE === 'pet' ? '宠物化改写' : 'Nissan 车型词改写'}）${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  // ── 1. 账号（逐条 create 拿新 id，供笔记/日Stat外键映射；userId 置空避免撞 1:1 唯一约束）──
  const srcAccounts = await prisma.kosAccount.findMany({ where: { brandId: FROM } });
  const accMap = new Map();
  if (!DRY_RUN) {
    for (const a of srcAccounts) {
      const { id, ...data } = strip(rewriteRow('kosAccount', { ...a }));
      const created = await prisma.kosAccount.create({
        data: { ...data, brandId: TO, authorId: PREFIX + a.authorId, userId: null },
        select: { id: true },
      });
      accMap.set(id, created.id);
    }
    console.log(`  KosAccount: 已写入 ${srcAccounts.length} 个（${PREFIX} 前缀，userId 置空）`);
  } else {
    console.log(`  KosAccount: 将复制 ${srcAccounts.length} 个`);
  }
  const remapAcc = (oldId) => (oldId != null ? accMap.get(oldId) ?? null : null);
  await copyBrandScoped('kosRosterEntry', 'KosRosterEntry');

  // ── 2. 账号表现日Stat（无 brandId 列，按新账号 id 挂靠）──
  if (srcAccounts.length) {
    const srcStats = await prisma.koxAccountDailyStat.findMany({
      where: { accountId: { in: srcAccounts.map((a) => a.id) } },
    });
    await insertMany('koxAccountDailyStat', srcStats.map((r) => {
      const { id, accountId, ...rest } = strip(r);
      return alignRow('koxAccountDailyStat', { ...rest, accountId: remapAcc(accountId) });
    }), 'KoxAccountDailyStat');
  }

  // ── 3. 笔记 ──
  const srcNotes = await prisma.koxNote.findMany({ where: { brandId: FROM } });
  await insertMany('koxNote', srcNotes.map((r) => {
    const { id, noteId, accountId, ...rest } = strip(r);
    return alignRow('koxNote', { ...rewriteRow('koxNote', { ...rest, noteId, id: r.id }), brandId: TO, noteId: PREFIX + noteId, accountId: remapAcc(accountId) });
  }), 'KoxNote');

  // ── 4. 笔记日Stat（量最大，分批）──
  const srcNoteStats = await prisma.koxNoteDailyStat.findMany({ where: { brandId: FROM } });
  await insertMany('koxNoteDailyStat', srcNoteStats.map((r) => {
    const { id, noteId, accountId, ...rest } = strip(r);
    return alignRow('koxNoteDailyStat', { ...rewriteRow('koxNoteDailyStat', { ...rest, noteId, id: r.id }), brandId: TO, noteId: PREFIX + noteId, accountId: remapAcc(accountId) });
  }), 'KoxNoteDailyStat');

  // ── 5. 聚光/投流 ──
  const srcContentNotes = await prisma.koxContentNoteDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxContentNoteDaily', srcContentNotes.map((r) => {
    const { id, noteId, ...rest } = strip(r);
    return alignRow('koxContentNoteDaily', { ...rewriteRow('koxContentNoteDaily', { ...rest, noteId, id: r.id }), brandId: TO, noteId: PREFIX + noteId });
  }), 'KoxContentNoteDaily');

  const srcContentStats = await prisma.koxContentStatDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxContentStatDaily', srcContentStats.map((r) => {
    const { id, vSellerId, ...rest } = strip(r);
    return alignRow('koxContentStatDaily', { ...rewriteRow('koxContentStatDaily', { ...rest, vSellerId, id: r.id }), brandId: TO, vSellerId: PREFIX + vSellerId });
  }), 'KoxContentStatDaily');

  const srcJuguang = await prisma.koxJuguangNoteDaily.findMany({ where: { brandId: FROM } });
  await insertMany('koxJuguangNoteDaily', srcJuguang.map((r) => {
    const { id, noteId, ...rest } = strip(r);
    return alignRow('koxJuguangNoteDaily', { ...rewriteRow('koxJuguangNoteDaily', { ...rest, noteId, id: r.id }), brandId: TO, noteId: PREFIX + noteId });
  }), 'KoxJuguangNoteDaily');

  const srcCampaign = await prisma.koxCampaignDailyStat.findMany({ where: { brandId: FROM } });
  await insertMany('koxCampaignDailyStat', srcCampaign.map((r) => {
    const { id, virtualSellerId, ...rest } = strip(r);
    return alignRow('koxCampaignDailyStat', { ...rewriteRow('koxCampaignDailyStat', { ...rest, virtualSellerId, id: r.id }), brandId: TO, virtualSellerId: PREFIX + virtualSellerId });
  }), 'KoxCampaignDailyStat');

  const srcSparkAccounts = await prisma.sparkAccount.findMany({ where: { brandId: FROM } });
  await insertMany('sparkAccount', srcSparkAccounts.map((r) => {
    const { id, virtualSellerId, ...rest } = strip(r);
    return alignRow('sparkAccount', { ...rewriteRow('sparkAccount', { ...rest, virtualSellerId, id: r.id }), brandId: TO, virtualSellerId: PREFIX + virtualSellerId });
  }), 'SparkAccount');

  // ── 6. 员工矩阵 / 专业号（复合唯一键含 brandId，直接换 brandId）──
  await copyBrandScoped('sparkStaffBrandDaily', 'SparkStaffBrandDaily');
  await copyBrandScoped('sparkStaffUserDaily', 'SparkStaffUserDaily');
  await copyBrandScoped('proKosOverview', 'ProKosOverview');
  await copyBrandScoped('proKosStaff', 'ProKosStaff');

  // ── 7. 线索 ──
  const srcLeads = await prisma.laiguLead.findMany({ where: { brandId: FROM } });
  await insertMany('laiguLead', srcLeads.map((r) => {
    const { id, sessionId, ...rest } = strip(r);
    return alignRow('laiguLead', { ...rewriteRow('laiguLead', { ...rest, sessionId, id: r.id }), brandId: TO, sessionId: PREFIX + sessionId });
  }), 'LaiguLead');

  await copyBrandScoped('laiguComment', 'LaiguComment');
  await copyBrandScoped('proClueDaily', 'ProClueDaily');
  await copyBrandScoped('proClueUserDay', 'ProClueUserDay');
  await copyBrandScoped('proClueToolStatDaily', 'ProClueToolStatDaily');
  await copyBrandScoped('clueAnalysisDaily', 'ClueAnalysisDaily');
  await copyBrandScoped('clueAcqToolDaily', 'ClueAcqToolDaily');

  // ── 8. 总览/排行快照类 ──
  await copyBrandScoped('koxDailyStat', 'KoxDailyStat');
  await copyBrandScoped('koxRegionAdSnapshot', 'KoxRegionAdSnapshot');
  await copyBrandScoped('koxDealerSnapshot', 'KoxDealerSnapshot');
  await copyBrandScoped('koxDealerSales', 'KoxDealerSales');
  await copyBrandScoped('koxWeeklySnapshot', 'KoxWeeklySnapshot');

  // ── 9. 投流项目（createdById 指向真实用户，保留；子账号 vSellerId 同步加前缀）──
  const srcProjects = await prisma.koxCampaignProject.findMany({ where: { brandId: FROM } });
  if (DRY_RUN) {
    console.log(`  KoxCampaignProject: 将复制 ${srcProjects.length} 个项目（含账号子表）`);
  } else {
    for (const p of srcProjects) {
      const child = await prisma.koxCampaignProjectAccount.findMany({ where: { projectId: p.id } });
      const { id, ...rest } = strip(rewriteRow('koxCampaignProject', { ...p }));
      const created = await prisma.koxCampaignProject.create({
        data: { ...rest, brandId: TO }, select: { id: true },
      });
      if (child.length) {
        await prisma.koxCampaignProjectAccount.createMany({
          data: child.map((c) => ({
            projectId: created.id,
            virtualSellerId: c.virtualSellerId.startsWith(PREFIX) ? c.virtualSellerId : PREFIX + c.virtualSellerId,
          })),
        });
      }
    }
    console.log(`  KoxCampaignProject: 已写入 ${srcProjects.length} 个项目`);
  }

  // ── 10. 洞察 ──
  await copyBrandScoped('insightContent', 'InsightContent');
  await copyBrandScoped('insightDailyStat', 'InsightDailyStat');
  await copyBrandScoped('insightReport', 'InsightReport');
}

async function reportTarget() {
  console.log(`\n[brand ${TO} 复制后行数]`);
  for (const t of SNAPSHOT_TABLES) {
    const n = await prisma[t].count({ where: { brandId: TO } });
    if (n > 0) console.log(`  ${t}: ${n}`);
  }
  const n = await countAccountDailyStat(TO);
  if (n > 0) console.log(`  koxAccountDailyStat: ${n}`);
  // 落库后二次断言：抽目标品牌全部文本行再扫一遍（防改写遗漏路径）
  if (MODE === 'pet') {
    const notes = await prisma.koxNote.findMany({
      where: { brandId: TO }, select: { id: true, title: true, content: true, authorName: true, topics: true },
    });
    let bad = 0;
    for (const n2 of notes) {
      assertClean(`recheck-koxNote#${n2.id}`, { title: n2.title, content: n2.content, authorName: n2.authorName, topics: n2.topics });
    }
    bad = violations.length;
    console.log(`  落库断言(宠物区文本无车词): ${bad ? '⛔ 发现 ' + bad + ' 处' : '✅ 通过'}`);
    if (bad) process.exitCode = 1;
  }
}

async function main() {
  console.log(`东风奕境(${FROM}) → 演示工作区(${TO}，${MODE === 'pet' ? '宠物' : 'Nissan'}) 市场数据复制`);
  console.log(`目标库: ${dbLabel()}${DRY_RUN ? ' [dry-run 只读]' : CLEAN_ONLY ? ' [仅清理]' : ' [将写入]'}`);
  if (!/\/saas_prod(\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 未指向 saas_prod——本脚本仅应在服务器上对 saas_prod 执行');
  }

  const before = await snapshotFrom('复制前');

  if (ALIGN_ARG && !CLEAN_ONLY) {
    const target00 = parseLocalDateStr(ALIGN_ARG);
    if (!target00 || Number.isNaN(target00.getTime())) throw new Error(`--align-date 格式应为 YYYY-MM-DD，收到: ${ALIGN_ARG}`);
    console.log(`\n[日期对齐] 各表数据截止时刻 → ${ALIGN_ARG} 00:00（刚性平移，仅 brand ${TO}）`);
    await computeAlignShifts(target00);
    for (const [model, ms] of Object.entries(ALIGN_SHIFTS)) {
      if (ms) console.log(`  ${model}: ${Math.round(ms / 86400000)} 天`);
    }
  }

  await cleanMock();
  if (!CLEAN_ONLY) {
    await copyAll();
    if (violations.length) {
      console.error(`\n⛔ ${MODE === 'pet' ? '宠物区' : 'Nissan区'}文本断言未通过（${violations.length} 处），请扩充改写词表后重跑：`);
      for (const v of violations.slice(0, 30)) console.error('  ' + v);
      console.error('（本次已写入的数据包含违禁词，请执行 --clean 回滚后修正词表）');
      process.exitCode = 1;
      return;
    }
  }

  if (!DRY_RUN) {
    const after = await snapshotFrom('复制后');
    const diffs = diffSnapshot(before, after);
    if (diffs.length) {
      console.error('\n⛔ brand 7 行数发生变化，可能被并发写入或脚本误写，请立即排查：');
      for (const d of diffs) console.error('  ' + d);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ brand ${FROM} 复制前后快照一致（只读承诺兑现）`);
    }
    await reportTarget();
  }
  console.log(DRY_RUN ? '\ndry-run 完成，未写库' : CLEAN_ONLY ? '\n清理完成' : '\n复制完成');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
