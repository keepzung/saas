import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';

const USER_SELECT = {
  id: true,
  phone: true,
  name: true,
  nickname: true,
  role: true,
  adminFlag: true,
  moduleIds: true,
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private sha1(text: string) {
    return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
  }

  private async assertOperator(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenException('仅管理员或项目管理员可操作');
    }
    return user.role;
  }

  private async assertCanTouch(operatorRole: string, targetId: number) {
    if (operatorRole === 'ADMIN') return;
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('项目管理员不可操作超级管理员账号');
    }
  }

  async getInfo(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    return {
      user_id: user.id,
      nickname: user.nickname ?? user.phone,
      mobile: user.phone,
      unionid: '',
      avatar: user.avatar,
      area: null,
      admin_flag: user.adminFlag,
      ckt_flag: user.cktFlag,
      company: {
        main_company_id: user.company.id,
        company_name: user.company.name,
        admin_flag: user.company.adminFlag,
        ckt_flag: 0,
        source_config: user.company.sourceConfig,
        user_company_status: user.company.userCompanyStatus,
      },
      company_source_config: {
        source_name: user.company.sourceConfig,
        system_name: user.company.systemName,
        system_desc: user.company.systemDesc,
        logo_url_full: user.company.logoUrlFull,
        logo_url_less: user.company.logoUrlLess,
        company_type: user.company.companyType,
      },
      brand_vlume_config: [],
      coze_bot_list: [],
      is_bind: 0,
    };
  }

  async getModuleList(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, moduleIds: true },
    });
    const allowAll = !user || user.role === 'ADMIN' || user.moduleIds.length === 0;
    const allowed = new Set(user?.moduleIds ?? []);

    const nodes = await this.prisma.moduleNode.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });

    const byParent = new Map<number | null, typeof nodes>();
    for (const node of nodes) {
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }

    const build = (parentId: null | number): unknown[] => {
      const children = byParent.get(parentId) ?? [];
      const result: unknown[] = [];
      for (const node of children) {
        if (node.type === 'feature') {
          if (!allowAll && !allowed.has(node.id)) continue;
          result.push({
            id: node.id,
            name: node.name,
            path: node.path,
            visible: node.visible,
            checked: true,
            start_time: null,
            end_time: null,
          });
        } else {
          const kids = build(node.id);
          if (kids.length === 0) continue;
          result.push({
            id: node.key,
            name: node.name,
            icon: node.icon,
            type: node.type,
            description: '',
            start_time: null,
            end_time: null,
            children: kids,
          });
        }
      }
      return result;
    };

    return build(null);
  }

  async listUsers(operatorId: number) {
    await this.assertOperator(operatorId);
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { ...USER_SELECT, brandMembers: { select: { brandId: true } } },
    });
    return {
      list: users.map(({ brandMembers, ...u }) => ({
        ...u,
        brandIds: brandMembers.map((m) => m.brandId),
      })),
    };
  }

  async createUser(operatorId: number, dto: CreateUserDto) {
    const operatorRole = await this.assertOperator(operatorId);
    if (operatorRole !== 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('仅超级管理员可创建管理员账号');
    }
    const exists = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('手机号已存在');

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash: bcrypt.hashSync(this.sha1(dto.password), 10),
        nickname: dto.nickname || dto.phone,
        role: dto.role,
        adminFlag: dto.role === 'ADMIN' ? 1 : 0,
        companyId: 1,
        moduleIds: dto.moduleIds ?? [],
      },
      select: USER_SELECT,
    });
    return user;
  }

  async updateUser(operatorId: number, id: number, dto: UpdateUserDto) {
    const operatorRole = await this.assertOperator(operatorId);
    await this.assertCanTouch(operatorRole, id);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    if (id === operatorId && dto.role && dto.role !== target.role) {
      throw new BadRequestException('不能修改自己的角色');
    }
    if (operatorRole !== 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('仅超级管理员可设置管理员角色');
    }

    const data: {
      nickname?: string;
      role?: 'ADMIN' | 'MANAGER' | 'SALES';
      moduleIds?: number[];
      adminFlag?: number;
    } = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.role !== undefined) {
      data.role = dto.role;
      data.adminFlag = dto.role === 'ADMIN' ? 1 : 0;
    }
    if (dto.moduleIds !== undefined) data.moduleIds = dto.moduleIds;

    if (dto.brandIds !== undefined && dto.role !== 'ADMIN') {
      await this.syncBrandMembers(id, dto.brandIds);
    }

    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  private async syncBrandMembers(userId: number, brandIds: number[]) {
    const next = new Set(brandIds);
    const current = await this.prisma.brandMember.findMany({
      where: { userId },
    });
    const managerKeys = ['agency_manager', 'brand_owner'];
    const keep = new Set(
      current.filter((m) => managerKeys.includes(m.roleKey)).map((m) => m.brandId),
    );
    for (const m of current) {
      if (keep.has(m.brandId)) continue;
      if (!next.has(m.brandId)) {
        await this.prisma.brandMember.delete({ where: { id: m.id } });
      }
    }
    for (const brandId of next) {
      if (keep.has(brandId)) continue;
      const exists = current.find(
        (m) => m.brandId === brandId && m.roleKey === 'agency_executive',
      );
      if (!exists) {
        await this.prisma.brandMember.create({
          data: { brandId, userId, roleKey: 'agency_executive' },
        });
      }
    }
  }

  async resetPassword(operatorId: number, id: number, dto: ResetPasswordDto) {
    const operatorRole = await this.assertOperator(operatorId);
    await this.assertCanTouch(operatorRole, id);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: bcrypt.hashSync(this.sha1(dto.password), 10) },
    });
    return { ok: true };
  }

  async getActionList(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { actions: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return { actions: user.actions };
  }
}
