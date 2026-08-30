import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async myBrands(userId: number) {
    const brands = await this.prisma.brand.findMany({
      where: { status: 1 },
      orderBy: { id: 'asc' },
      include: {
        members: { where: { userId } },
      },
    });

    return {
      list: brands.map((brand) => ({
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
