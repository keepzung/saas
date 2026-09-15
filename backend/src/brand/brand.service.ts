import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async myBrands(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isSuperAdmin = !user || user.role === 'ADMIN';
    const brands = await this.prisma.brand.findMany({
      where: { status: 1 },
      orderBy: { id: 'asc' },
      include: {
        members: { where: { userId } },
      },
    });
    const visible = isSuperAdmin
      ? brands
      : brands.filter((b) => b.members.length > 0);

    return {
      list: visible.map((brand) => ({
        id: brand.id,
        companyId: brand.companyId,
        name: brand.name,
        description: brand.description,
        logo: brand.logo,
        status: brand.status,
        roleKey: brand.members[0]?.roleKey ?? '',
        roleKeys: brand.members.map((m) => m.roleKey),
        createdAt: brand.createdAt,
      })),
    };
  }

  async myRoles(userId: number, brandId?: number) {
    const where = brandId
      ? { userId, brandId }
      : { userId };
    const members = await this.prisma.brandMember.findMany({ where });
    return members.map((m) => ({
      brandId: m.brandId,
      userId: m.userId,
      roleKey: m.roleKey,
    }));
  }
}
