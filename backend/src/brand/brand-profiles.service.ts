import { Injectable } from '@nestjs/common';
import {
  BrandProfile,
  FunnelCaliber,
  getBrandProfile,
  PROFILES,
} from './brand-profiles';

/**
 * 品牌档案服务(架构蓝图 v2 横切①):业务代码通过它读品牌差异,不再写 brandId===N 硬编码。
 * 纯静态注册表(PROS 内置),无 DB 依赖;后续如需运营可调再迁表,接口不变。
 */
@Injectable()
export class BrandProfilesService {
  /** 取品牌档案(未配置品牌返回安全默认:通道全关、通用口径) */
  getProfile(brandId?: number): BrandProfile {
    return getBrandProfile(brandId);
  }

  /** 全部已配置档案(巡检/运维界面用) */
  listProfiles(): BrandProfile[] {
    return Object.values(PROFILES).sort((a, b) => a.brandId - b.brandId);
  }

  /** 漏斗口径(按参考日期判版本,since 前取回退口径) */
  funnelCaliber(brandId: number, at?: Date | string): FunnelCaliber {
    const p = this.getProfile(brandId);
    if (!p.funnel.since || !at) return p.funnel.caliber;
    const d = typeof at === 'string' ? new Date(at) : at;
    return Number.isNaN(d.getTime()) || d >= new Date(p.funnel.since)
      ? p.funnel.caliber
      : p.funnel.fallback ?? p.funnel.caliber;
  }

  /** patrol L5 巡检范围与阈值(给 patrol 脚本的唯一事实,避免两处硬编码) */
  patrolScope(): { brandId: number; coverThreshold: number }[] {
    return this.listProfiles()
      .filter((p) => p.patrol.inScope)
      .map((p) => ({ brandId: p.brandId, coverThreshold: p.patrol.coverThreshold ?? 15 }));
  }
}
