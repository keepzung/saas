// 特斯拉笔记规则分类（标题关键词）：内容类型 + 车型
// 内容：干货 / 种草 / 互动 / 政策（用户口径：干货、种草、互动、政策）
// 车型：Model3 / Y / YL / YP / 3P / X / S
export interface NoteClass {
  category: string;
  modelTag: string;
}

const MODEL_RULES: [RegExp, string][] = [
  [/model\s*y\s*l|^\s*yl\b|\bYL\b/i, 'YL'],
  [/model\s*y\s*p(?!u)|\bYP\b/i, 'YP'],
  [/model\s*3\s*p(?!u)|\b3P\b/i, '3P'],
  [/model\s*x\b|\bmodelx\b/i, 'X'],
  [/model\s*s\b|\bmodels\b/i, 'S'],
  [/model\s*3\b|model3|毛豆3/i, 'Model3'],
  [/model\s*y\b|modely|毛豆y|model\s*y/i, 'Y'],
];

const CATEGORY_RULES: [RegExp, string][] = [
  [
    /价格|售价|降价|涨价|优惠|权益|补贴|金融|免息|分期|万元|万起|w起|w起价|落地价?|提车价|预售|政策|官降|直降|现金|报价|多少钱|贵吗|划算|省钱/i,
    '政策',
  ],
  [
    /干货|攻略|指南|技巧|怎么选|如何|科普|评测|对比|配置|参数|功能|智驾|智能驾驶|辅助驾驶|自动驾驶|讲解|知识|教程|避坑|注意|盘点|解析|实测|续航|充电|能耗/i,
    '干货',
  ],
  [
    /吗[？?！!]?$|[？?]|聊聊|讨论|说说|你们|大家|评论区|投票|什么水平|怎么看|求建议|纠结|犹豫|值得吗|能不能|还能买/i,
    '互动',
  ],
];

export function classifyTeslaNote(title: string): NoteClass {
  const t = String(title ?? '');
  let modelTag = '';
  for (const [re, tag] of MODEL_RULES) {
    if (re.test(t)) {
      modelTag = tag;
      break;
    }
  }
  let category = '种草';
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(t)) {
      category = cat;
      break;
    }
  }
  return { category, modelTag: modelTag || '未提及' };
}
