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

  private async assertAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可操作');
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
    await this.assertAdmin(operatorId);
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: USER_SELECT,
    });
    return { list: users };
  }

  async createUser(operatorId: number, dto: CreateUserDto) {
    await this.assertAdmin(operatorId);
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
    await this.assertAdmin(operatorId);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    if (id === operatorId && dto.role && dto.role !== 'ADMIN') {
      throw new BadRequestException('不能取消自己的管理员角色');
    }

    const data: {
      nickname?: string;
      role?: 'ADMIN' | 'SALES';
      moduleIds?: number[];
      adminFlag?: number;
    } = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.role !== undefined) {
      data.role = dto.role;
      data.adminFlag = dto.role === 'ADMIN' ? 1 : 0;
    }
    if (dto.moduleIds !== undefined) data.moduleIds = dto.moduleIds;

    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  async resetPassword(operatorId: number, id: number, dto: ResetPasswordDto) {
    await this.assertAdmin(operatorId);
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
