import { Injectable } from '@nestjs/common';

/**
 * KOS 账号留资分层引擎（特斯拉数据看板公共逻辑）
 *
 * 分层规则（周度留资量，月度数据按 ÷4 折算周度，任意周期按 L/(days/7) 归一）：
 *   S级头部 ≥50 / 头部 ≥25 / 高潜 12.5–25 / 腰部 6.25–12.5 / 尾部 <6
 *
 * 留资口径：KoxNote.pmLeads（含投流笔记），周期 = 筛选日期区间。
 * 供：账号排行（分层排序）/ KOS账号留资分层页（经销商排行）/ 运营总览共用。
 */

export interface KosTierMeta {
  key: string;
  label: string;
  min: number; // 周度留资下界（含）
  max: number; // 周度留资上界（不含），Infinity 为无上界
  color: string;
  rank: number; // 排序权重，越小越靠前
}

export const KOS_TIERS: KosTierMeta[] = [
  { key: 's_head', label: 'S级头部', min: 50, max: Infinity, color: '#dc2626', rank: 0 },
  { key: 'head', label: '头部', min: 25, max: 50, color: '#f97316', rank: 1 },
  { key: 'potential', label: '高潜', min: 12.5, max: 25, color: '#d97706', rank: 2 },
  { key: 'waist', label: '腰部', min: 6.25, max: 12.5, color: '#3456E6', rank: 3 },
  { key: 'tail', label: '尾部', min: 0, max: 6.25, color: '#94a3b8', rank: 4 },
];

const EPS = 1e-9;

/** 周期留资量 → 折算周度留资（days 为周期天数，<=0 时按原值） */
export function toWeekly(leads: number, days: number): number {
  if (!Number.isFinite(leads) || leads <= 0) return 0;
  if (!Number.isFinite(days) || days <= 0) return leads;
  return leads / (days / 7);
}

/** 周度留资 → 层级元数据 */
export function tierOfWeekly(weekly: number): KosTierMeta {
  for (const t of KOS_TIERS) {
    if (weekly >= t.min - EPS && weekly < t.max - EPS) return t;
  }
  // weekly ≥ 50 兜底（浮点边界）
  return KOS_TIERS[KOS_TIERS.length - 1];
}

/** 周期留资量 + 周期天数 → 层级元数据 */
export function classifyTier(leads: number, days: number): KosTierMeta {
  return tierOfWeekly(toWeekly(leads, days));
}

/** 小红书通用 CES：点赞×1 + 收藏×1 + 评论×4 + 分享×4 + 关注×8 */
export function calcCes(
  likes = 0,
  collects = 0,
  comments = 0,
  shares = 0,
  follows = 0,
): number {
  return likes + collects + comments * 4 + shares * 4 + follows * 8;
}

@Injectable()
export class KosTierService {
  tiers() {
    return KOS_TIERS;
  }

  classify(leads: number, days: number): KosTierMeta {
    return classifyTier(leads, days);
  }

  ces(
    likes = 0,
    collects = 0,
    comments = 0,
    shares = 0,
    follows = 0,
  ): number {
    return calcCes(likes, collects, comments, shares, follows);
  }
}
