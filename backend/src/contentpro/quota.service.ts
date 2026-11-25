// 算力配额：生成 1 篇 = 1 算力，失败退回；智能编辑每日独立 5 次
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const COVER_EDIT_DAILY_LIMIT = 5;
const QUOTA_DEFAULT_TOTAL = Number(process.env.BRAND_QUOTA_DEFAULT ?? 2000);
const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private prisma: PrismaService) {}

  /** 品牌算力池（首次访问自动建池） */
  private async ensureBrand(brandId: number) {
    const found = await this.prisma.brandQuota.findUnique({ where: { brandId } });
    if (found) return found;
    try {
      return await this.prisma.brandQuota.create({
        data: { brandId, total: QUOTA_DEFAULT_TOTAL, used: 0 },
      });
    } catch {
      const again = await this.prisma.brandQuota.findUnique({ where: { brandId } });
      if (again) return again;
      throw new BadRequestException('算力池初始化失败');
    }
  }

  async summary(brandId: number) {
    const q = await this.ensureBrand(brandId);
    const logs = await this.prisma.quotaLog.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      total: q.total,
      used: q.used,
      available: Math.max(0, q.total - q.used),
      cover_edit_limit: COVER_EDIT_DAILY_LIMIT,
      recent_logs: logs.map((l) => ({
        id: l.id,
        delta: l.delta,
        kind: l.kind,
        remark: l.remark,
        user_id: l.userId,
        created_at: l.createdAt,
      })),
    };
  }

  /** 预检：余额是否够 n 篇 */
  async assertEnough(brandId: number, n: number) {
    if (n <= 0) return;
    const q = await this.ensureBrand(brandId);
    if (q.total - q.used < n) {
      throw new BadRequestException(`算力不足：可用 ${Math.max(0, q.total - q.used)}，本次需 ${n}，请联系管理员充值`);
    }
  }

  /** 消耗 n 算力（调用前应 assertEnough；批量逐篇扣减） */
  async consume(brandId: number, n: number, userId?: number, remark?: string) {
    if (n <= 0) return;
    await this.ensureBrand(brandId);
    await this.prisma.brandQuota.update({
      where: { brandId },
      data: { used: { increment: n } },
    });
    await this.prisma.quotaLog.create({
      data: { brandId, userId: userId ?? null, delta: -n, kind: 'consume', remark: remark ?? null },
    });
  }

  /** 失败退回 */
  async refund(brandId: number, n: number, userId?: number, remark?: string) {
    if (n <= 0) return;
    await this.ensureBrand(brandId);
    const q = await this.prisma.brandQuota.update({
      where: { brandId },
      data: { used: { decrement: n } },
    });
    if (q.used < 0) {
      await this.prisma.brandQuota.update({ where: { brandId }, data: { used: 0 } });
    }
    await this.prisma.quotaLog.create({
      data: { brandId, userId: userId ?? null, delta: n, kind: 'refund', remark: remark ?? null },
    });
  }

  /** 管理员充值/调整（正负皆可） */
  async grant(brandId: number, amount: number, userId?: number, remark?: string) {
    if (!amount) throw new BadRequestException('调整额度不能为 0');
    await this.ensureBrand(brandId);
    const q = await this.prisma.brandQuota.update({
      where: { brandId },
      data: { total: { increment: amount } },
    });
    await this.prisma.quotaLog.create({
      data: { brandId, userId: userId ?? null, delta: amount, kind: 'grant', remark: remark ?? '管理员调整' },
    });
    this.logger.log(`brand ${brandId} quota grant ${amount} → total ${q.total}`);
    return { total: q.total, available: Math.max(0, q.total - q.used) };
  }

  /** 智能编辑当日用量（每日 5 次独立配额，不占算力池） */
  async coverEditStatus(brandId: number, userId: number) {
    const day = localDay();
    const row = await this.prisma.coverEditUsage.findUnique({
      where: { userId_day: { userId, day } },
    });
    const used = row?.count ?? 0;
    return { day, used, limit: COVER_EDIT_DAILY_LIMIT, remaining: Math.max(0, COVER_EDIT_DAILY_LIMIT - used) };
  }

  /** 智能编辑消耗 1 次（超限抛错） */
  async coverEditConsume(brandId: number, userId: number) {
    const st = await this.coverEditStatus(brandId, userId);
    if (st.remaining <= 0) {
      throw new BadRequestException(`智能编辑今日 ${st.limit} 次已用完，明天再来`);
    }
    const day = st.day;
    await this.prisma.coverEditUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { brandId, userId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    return { ...st, used: st.used + 1, remaining: st.remaining - 1 };
  }

  // ── AI 海报/场景生图：每用户每日次数（限额按工作区配置，默认 20）──
  readonly AI_POSTER_DEFAULT_LIMIT = 20;
  /** 可调整限额的权限码：授予 User.actions（许林等），ADMIN 角色天然可调 */
  readonly AI_POSTER_LIMIT_ACTION = 'ai_poster_limit_set';

  async aiPosterStatus(brandId: number, userId: number) {
    const day = localDay();
    const [limitRow, usageRow] = await Promise.all([
      this.prisma.aiPosterLimit.findUnique({ where: { brandId } }),
      this.prisma.aiPosterUsage.findUnique({ where: { userId_day: { userId, day } } }),
    ]);
    const limit = limitRow?.limitPerUser ?? this.AI_POSTER_DEFAULT_LIMIT;
    const used = usageRow?.count ?? 0;
    return { day, limit, used, remaining: Math.max(0, limit - used) };
  }

  async aiPosterConsume(brandId: number, userId: number) {
    const st = await this.aiPosterStatus(brandId, userId);
    if (st.remaining <= 0) {
      throw new BadRequestException(`今日 AI 生图次数已用完（${st.limit} 次/天），明天再来或联系管理员调整限额`);
    }
    const day = st.day;
    await this.prisma.aiPosterUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { brandId, userId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    return { ...st, used: st.used + 1, remaining: st.remaining - 1 };
  }

  /** 生成失败不占当日次数 */
  async aiPosterRelease(brandId: number, userId: number) {
    const day = localDay();
    const row = await this.prisma.aiPosterUsage.findUnique({ where: { userId_day: { userId, day } } });
    if (!row || row.count <= 0) return;
    await this.prisma.aiPosterUsage.update({ where: { userId_day: { userId, day } }, data: { count: { decrement: 1 } } });
  }

  async aiPosterSetLimit(brandId: number, limit: number, updatedById: number) {
    const row = await this.prisma.aiPosterLimit.upsert({
      where: { brandId },
      create: { brandId, limitPerUser: limit, updatedById },
      update: { limitPerUser: limit, updatedById },
    });
    return { brandId, limitPerUser: row.limitPerUser };
  }

  /** 限额设置权限：ADMIN 角色 或 持 ai_poster_limit_set 权限码的用户 */
  async aiPosterCanManage(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, actions: true } });
    if (!user) return false;
    return user.role === 'ADMIN' || (user.actions ?? []).includes(this.AI_POSTER_LIMIT_ACTION);
  }
}
