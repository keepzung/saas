import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OrgNode {
  id: number;
  brandId: number;
  name: string;
  level: number;
  parentId: number | null;
  regionName: string | null;
  cityName: string | null;
  sort: number;
  status: string;
  userCount: number;
  kosCount: number;
  children: OrgNode[];
}

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  /** ADMIN 全局；其余需为该品牌 brand_admin / org_manager */
  private async assertBrandOperator(userId: number, brandId?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new ForbiddenException('用户不存在');
    if (user.role === 'ADMIN') return;
    const members = await this.prisma.brandMember.findMany({
      where: { userId, ...(brandId ? { brandId } : {}) },
      select: { brandId: true, roleKey: true },
    });
    const ok =
      members.some((m) => ['brand_admin', 'org_manager'].includes(m.roleKey)) ||
      user.role === 'MANAGER';
    if (!ok) throw new ForbiddenException('仅工作区/组织管理员可管理组织');
  }

  async tree(userId: number, brandId: number) {
    await this.assertBrandOperator(userId, brandId);
    const orgs = await this.prisma.brandOrg.findMany({
      where: { brandId },
      orderBy: [{ level: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { users: true } },
      },
    });
    const kosCounts = await Promise.all(
      orgs.map((o) =>
        this.prisma.kosAccount.count({ where: { brandId: brandId, user: { orgId: o.id } } }),
      ),
    );
    const kosMap = new Map(orgs.map((o, i) => [o.id, kosCounts[i]]));

    const nodes = new Map<number, OrgNode>();
    for (const o of orgs) {
      nodes.set(o.id, {
        id: o.id,
        brandId: o.brandId,
        name: o.name,
        level: o.level,
        parentId: o.parentId,
        regionName: o.regionName,
        cityName: o.cityName,
        sort: o.sort,
        status: o.status,
        userCount: o._count.users,
        kosCount: kosMap.get(o.id) ?? 0,
        children: [],
      });
    }
    const roots: OrgNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return { list: roots };
  }

  async create(userId: number, dto: {
    brandId: number;
    name: string;
    level: number;
    parentId?: number;
    regionName?: string;
    cityName?: string;
  }) {
    await this.assertBrandOperator(userId, dto.brandId);
    if (dto.parentId) {
      const parent = await this.prisma.brandOrg.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.brandId !== dto.brandId) {
        throw new BadRequestException('父组织不存在或不属于该工作区');
      }
      if (dto.level <= parent.level) {
        throw new BadRequestException('子组织层级必须大于父组织');
      }
    }
    const exists = await this.prisma.brandOrg.findFirst({
      where: { brandId: dto.brandId, name: dto.name, level: dto.level },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('同级同名组织已存在');
    return this.prisma.brandOrg.create({
      data: {
        brandId: dto.brandId,
        name: dto.name,
        level: dto.level,
        parentId: dto.parentId ?? null,
        regionName: dto.regionName ?? null,
        cityName: dto.cityName ?? null,
      },
    });
  }

  async update(userId: number, id: number, dto: {
    name?: string;
    level?: number;
    parentId?: number | null;
    regionName?: string | null;
    cityName?: string | null;
    sort?: number;
    status?: string;
  }) {
    const org = await this.prisma.brandOrg.findUnique({ where: { id } });
    if (!org) throw new BadRequestException('组织不存在');
    await this.assertBrandOperator(userId, org.brandId);
    if (dto.parentId) {
      const parent = await this.prisma.brandOrg.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.brandId !== org.brandId) {
        throw new BadRequestException('父组织不存在或不属于该工作区');
      }
      if (parent.id === id) throw new BadRequestException('不能把自己设为父组织');
    }
    return this.prisma.brandOrg.update({ where: { id }, data: dto });
  }

  async remove(userId: number, id: number) {
    const org = await this.prisma.brandOrg.findUnique({ where: { id } });
    if (!org) throw new BadRequestException('组织不存在');
    await this.assertBrandOperator(userId, org.brandId);
    const childCount = await this.prisma.brandOrg.count({ where: { parentId: id } });
    if (childCount > 0) throw new BadRequestException('存在子组织，请先删除/迁移子组织');
    const userCount = await this.prisma.user.count({ where: { orgId: id } });
    if (userCount > 0) throw new BadRequestException(`组织下仍有 ${userCount} 个账号，请先迁移`);
    await this.prisma.brandOrg.delete({ where: { id } });
    return { ok: true };
  }
}
