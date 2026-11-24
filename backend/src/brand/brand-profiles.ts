// 品牌档案(租户档案层,架构蓝图 v2 横切①):品牌间差异的声明式唯一事实。
// 新增品牌 = 在 PROFILES 加一条;后端业务分支逐步改为读档案,消灭 brandId===N 硬编码。
// 与前端 frontend/src/config/brands.js(BRAND_THEMES,样式维度)对称;这里管数据口径维度。
// ⚠️ 字段含义见 BrandProfile 注释;改动口径字段(since/caliber)即口径切换,需在 commit 里写明依据。

export type FunnelCaliber = 'note_pm' | 'clue_tool' | 'pro_clue';

/** 漏斗(私信进线/开口/留资)口径 */
export interface BrandFunnelProfile {
  /** note_pm=笔记报表私信字段逐窗求和; clue_tool=MCC线索分析·获客工具统计; pro_clue=专业号·客户管理 */
  caliber: FunnelCaliber;
  /** 口径生效起始日(留痕;客户问"数怎么变了"的账) */
  since?: string;
  /** 主口径数据缺失时的回退口径(如奕境 clue 表空 → note_pm) */
  fallback?: FunnelCaliber;
  /** 仅统计该 advertiserId(MDD 10847045 单一投放账户) */
  advertiserFilter?: string;
  /** 自然口径 = 总数 − 聚光投放日报三数 */
  natureSubtract?: 'campaign';
}

/** 笔记同步与收录口径 */
export interface BrandNotesProfile {
  /** rolling_backfill=每日滚动重拉近35天(荣威); window30=滚动30天发布窗(MDD); daily_partition=逐日分区(奕境/格力) */
  mode: 'rolling_backfill' | 'window30' | 'daily_partition';
  /** 聚光笔记报表 noteSources 过滤(荣威/MDD) */
  noteSources?: string[];
  /** 未匹配创作者自动注册为账号(荣威) */
  autoRegisterAuthors?: boolean;
  /** 仅入库基线账号内容(MDD:拦截来鼓租户多品牌回流) */
  baselineOnly?: boolean;
  /** 排除的作者(MDD 官号 MorganDaDa) */
  excludeAuthors?: string[];
  /** 仅监控账号范围(格力:MCC 组织视图含全国经销商,查询层隐藏) */
  monitorScopeOnly?: boolean;
  /** KoxNote 主表弃用,内容指标走专业号员工矩阵(特斯拉) */
  masterDeprecated?: boolean;
}

/** 投放日报口径 */
export interface BrandCampaignProfile {
  /** 仅统计该 advertiserId */
  advertiserFilter?: string;
  /** 无显式日期时连刷近 N 天(消化未结算尾差;MDD=3) */
  noDateRefetchDays?: number;
}

/** 巡检(patrol L5)口径 */
export interface BrandPatrolProfile {
  /** 是否纳入 L5 指标级巡检(演示区/零管道区=false) */
  inScope: boolean;
  /** 封面缺失率告警阈值(默认 15,单位 %) */
  coverThreshold?: number;
}

export interface BrandProfile {
  brandId: number;
  name: string;
  short: string;
  /** 数据通道启用位(档案消费者的总闸;零管道品牌全 false) */
  channels: { spark: boolean; partner: boolean; pro: boolean; laigu: boolean };
  funnel: BrandFunnelProfile;
  notes: BrandNotesProfile;
  campaign?: BrandCampaignProfile;
  patrol: BrandPatrolProfile;
}

export const DEFAULT_PROFILE: BrandProfile = {
  brandId: 0,
  name: '未配置品牌',
  short: '未配置',
  channels: { spark: false, partner: false, pro: false, laigu: false },
  funnel: { caliber: 'note_pm' },
  notes: { mode: 'daily_partition' },
  patrol: { inScope: false },
};

export const PROFILES: Record<number, BrandProfile> = {
  2: {
    brandId: 2,
    name: '荣威项目工作区',
    short: '荣威',
    channels: { spark: true, partner: false, pro: true, laigu: false },
    funnel: { caliber: 'note_pm' },
    notes: {
      mode: 'rolling_backfill',
      noteSources: ['专业号笔记', '员工笔记'],
      autoRegisterAuthors: true,
    },
    patrol: { inScope: true },
  },
  4: {
    brandId: 4,
    name: '大众项目工作区',
    short: '大众',
    // 大众零管道(历史定论):无任何数据通道
    channels: { spark: false, partner: false, pro: false, laigu: false },
    funnel: { caliber: 'note_pm' },
    notes: { mode: 'daily_partition' },
    patrol: { inScope: false },
  },
  5: {
    brandId: 5,
    name: 'Morgandada项目工作区',
    short: 'MDD',
    channels: { spark: true, partner: false, pro: true, laigu: true },
    funnel: {
      caliber: 'clue_tool',
      since: '2026-10-21',
      advertiserFilter: '10847045',
      natureSubtract: 'campaign',
    },
    notes: {
      mode: 'window30',
      noteSources: ['员工笔记'],
      baselineOnly: true,
      excludeAuthors: ['MorganDaDa'],
    },
    campaign: { advertiserFilter: '10847045', noDateRefetchDays: 3 },
    patrol: { inScope: true },
  },
  6: {
    brandId: 6,
    name: '特斯拉项目工作区',
    short: '特斯拉',
    channels: { spark: true, partner: true, pro: true, laigu: false },
    funnel: { caliber: 'pro_clue' },
    notes: { mode: 'daily_partition', masterDeprecated: true },
    patrol: { inScope: true },
  },
  7: {
    brandId: 7,
    name: '东风奕境项目工作区',
    short: '东风奕境',
    channels: { spark: true, partner: false, pro: false, laigu: false },
    funnel: {
      caliber: 'clue_tool',
      since: '2026-11-24',
      fallback: 'note_pm',
      natureSubtract: 'campaign',
    },
    notes: { mode: 'daily_partition' },
    patrol: { inScope: true },
  },
  8: {
    brandId: 8,
    name: '格力项目工作区',
    short: '格力',
    channels: { spark: true, partner: false, pro: false, laigu: false },
    funnel: { caliber: 'note_pm' },
    notes: { mode: 'daily_partition', monitorScopeOnly: true },
    patrol: { inScope: true, coverThreshold: 70 },
  },
};

/** 取品牌档案;未配置品牌返回安全默认(所有通道关闭/通用口径,即"无特判"路径) */
export function getBrandProfile(brandId?: number): BrandProfile {
  if (!brandId) return DEFAULT_PROFILE;
  return PROFILES[brandId] ?? { ...DEFAULT_PROFILE, brandId };
}

/** 指定日期的漏斗有效口径(按 since 判版本;口径留痕的查询入口) */
export function funnelCaliberAt(brandId: number, at?: Date | string): FunnelCaliber {
  const p = getBrandProfile(brandId);
  if (!p.funnel.since || !at) return p.funnel.caliber;
  const d = typeof at === 'string' ? new Date(at) : at;
  return Number.isNaN(d.getTime()) || d >= new Date(p.funnel.since)
    ? p.funnel.caliber
    : p.funnel.fallback ?? p.funnel.caliber;
}
