import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 工作区（brandId）成员校验：内容工厂Pro / 内容创作任务数据强隔离。
 * ADMIN 放行；其他用户必须是该 brandId 的 BrandMember，否则 403。
 * brandId 从 query/body 取（与各端点一致的传参方式）；缺失的端点（如 ai/health）跳过。
 */
@Injectable()
export class BrandAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { id: number; role: string } | undefined;
    if (!user) return true; // 未登录由 JwtAuthGuard 拦截
    if (user.role === 'ADMIN') return true;
    const raw = req.query?.brandId ?? req.body?.brandId;
    if (raw === undefined || raw === null || raw === '') return true;
    const brandId = Number(raw);
    if (!Number.isInteger(brandId) || brandId <= 0) return true;
    const member = await this.prisma.brandMember.findFirst({
      where: { userId: user.id, brandId },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('无权访问该工作区数据');
    return true;
  }
}
