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
  BatchCreateUsersDto,
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

  private async assertCanTouch(operatorRole: string, operatorId: number, targetId: number) {
    if (operatorRole === 'ADMIN') return;
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true, createdById: true, brandMembers: { select: { brandId: true } } },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('项目管理员不可操作超级管理员账号');
    }
    if (targetId === operatorId || target.createdById === operatorId) return;
    // 同工作区成员也可操作（如平台统一导入的账号交由项目管理员日常管理）
    const mine = await this.prisma.brandMember.findMany({
      where: { userId: operatorId },
      select: { brandId: true },
    });
    const myBrandIds = mine.map((m) => m.brandId);
    const shares = target.brandMembers.some((m) => myBrandIds.includes(m.brandId));
    if (!shares) {
      throw new ForbiddenException('项目管理员仅可操作自己创建的账号或同工作区成员');
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
      role: user.role,
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
    // 仅超级管理员默认全模块；其他用户严格按 moduleIds 分配（空=未分配，不可见业务页面）
    const allowAll = !!user && user.role === 'ADMIN';
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
    const operatorRole = await this.assertOperator(operatorId);
    let where: Record<string, unknown> = {};
    if (operatorRole !== 'ADMIN') {
      // 项目管理员可见：自己创建的 ∪ 自己 ∪ 自己所在工作区的全部成员
      const myBrands = await this.prisma.brandMember.findMany({
        where: { userId: operatorId },
        select: { brandId: true },
      });
      const brandIds = myBrands.map((b) => b.brandId);
      where = {
        OR: [
          { createdById: operatorId },
          { id: operatorId },
          ...(brandIds.length ? [{ brandMembers: { some: { brandId: { in: brandIds } } } }] : []),
        ],
      };
    }
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      where,
      select: {
        ...USER_SELECT,
        brandMembers: { select: { brandId: true, roleKey: true } },
        org: { select: { id: true, name: true, level: true } },
        kosAccount: { select: { id: true, nickname: true, storeName: true } },
      },
    });
    return {
      list: users.map(({ brandMembers, org, kosAccount, ...u }) => ({
        ...u,
        brandIds: brandMembers.map((m) => m.brandId),
        brandRoles: brandMembers.map((m) => ({
          brandId: m.brandId,
          roleKey: m.roleKey,
        })),
        org: org ?? null,
        kosAccount: kosAccount ?? null,
      })),
    };
  }

  /** 表单系统角色 → 工作区角色映射 */
  private brandRoleKeyOf(role: string): string {
    if (role === 'ADMIN') return 'brand_admin';
    if (role === 'MANAGER') return 'agency_executive';
    return 'kos_operator';
  }

  /** 默认模块集（按角色）：KOS 员工=任务派发+内容工厂；项目管理员=管理默认集（任务/KOX/内容工厂管理） */
  private static readonly KOS_DEFAULT_PATHS = [
    '/content-pro/content-factory/xhs-image-text-single',
    '/content-pro/history',
    '/kox_task/content-task/task-list',
  ];
  private static readonly MANAGER_DEFAULT_PATHS = [
    '/content-pro/workbench',
    '/content-pro/config/products',
    '/content-pro/config/material',
    '/content-pro/config/strategies',
    '/content-pro/content-factory/xhs-image-text-single',
    '/content-pro/content-factory/xhs-image-text-batch',
    '/content-pro/comment',
    '/content-pro/history',
    '/content-pro/package',
    '/content-pro/audit',
    '/content-pro/claim-log',
    '/content-pro/hot-content',
    '/kox_df/operation-analysis/overview',
    '/kox_df/operation-analysis/dealer-ranking',
    '/kox_df/operation-analysis/author-ranking',
    '/kox_df/operation-analysis/note-ranking',
    '/kox_df/operation-analysis/region-data',
    '/kox_df/operation-analysis/hot-content',
    '/kox_df/operation-analysis/feedback',
    '/kox_df/campaign-analysis/plans',
    '/kox_df/campaign-analysis/project-reports',
    '/kox_df/campaign-analysis/cycle-report',
    '/kox_df/monitoring/list',
    '/kox_df/monitoring/add',
    '/kox_df/monitoring/records',
    '/kox_task/content-task/task-list',
    '/kox_task/content-task/create-task',
    '/users/manage',
  ];

  private async resolveDefaultModuleIds(role: string): Promise<number[]> {
    const paths =
      role === 'MANAGER'
        ? UserService.MANAGER_DEFAULT_PATHS
        : role === 'SALES'
          ? UserService.KOS_DEFAULT_PATHS
          : [];
    if (!paths.length) return [];
    const nodes = await this.prisma.moduleNode.findMany({
      where: { path: { in: paths }, type: 'feature' },
      select: { id: true },
    });
    return nodes.map((n) => n.id);
  }

  async createUser(operatorId: number, dto: CreateUserDto) {
    const operatorRole = await this.assertOperator(operatorId);
    if (operatorRole !== 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('仅超级管理员可创建管理员账号');
    }

    // 全局用户池：手机号已注册的用户直接加入当前工作区（跨项目复用），同项目内禁止重复添加
    const exists = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
      select: { id: true, role: true },
    });
    if (exists) {
      if (!dto.brandId) {
        throw new BadRequestException('该手机号已注册。请选择工作区后重试，系统会将其加入当前项目');
      }
      if (operatorRole !== 'ADMIN' && exists.role === 'ADMIN') {
        throw new ForbiddenException('项目管理员不可操作超级管理员账号');
      }
      const member = await this.prisma.brandMember.findFirst({
        where: { userId: exists.id, brandId: dto.brandId },
        select: { id: true },
      });
      if (member) throw new BadRequestException('该用户已加入当前项目，请勿重复添加');
      // syncBrandMembers 内部会校验非超管只能分配自己所属的工作区
      await this.syncBrandMembers(
        exists.id,
        [{ brandId: dto.brandId, roleKey: this.brandRoleKeyOf(dto.role) }],
        operatorRole,
        operatorId,
      );
      const adopted = await this.prisma.user.findUnique({ where: { id: exists.id }, select: USER_SELECT });
      return { ...adopted, adopted: true };
    }

    // 未显式指定模块时按角色给默认集（KOS 员工=任务派发+内容工厂；项目管理员=管理默认集）
    const defaultModuleIds =
      dto.moduleIds === undefined && dto.brandId
        ? await this.resolveDefaultModuleIds(dto.role)
        : (dto.moduleIds ?? []);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash: bcrypt.hashSync(this.sha1(dto.password), 10),
        nickname: dto.nickname || dto.phone,
        role: dto.role,
        adminFlag: dto.role === 'ADMIN' ? 1 : 0,
        companyId: 1,
        moduleIds: defaultModuleIds,
        createdById: operatorId,
      },
      select: USER_SELECT,
    });
    if (dto.brandId) {
      await this.syncBrandMembers(
        user.id,
        [{ brandId: dto.brandId, roleKey: this.brandRoleKeyOf(dto.role) }],
        operatorRole,
        operatorId,
      );
    }
    return { ...user, adopted: false };
  }

  async updateUser(operatorId: number, id: number, dto: UpdateUserDto) {
    const operatorRole = await this.assertOperator(operatorId);
    await this.assertCanTouch(operatorRole, operatorId, id);
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

    if (dto.brandRoles !== undefined && dto.role !== 'ADMIN') {
      await this.syncBrandMembers(id, dto.brandRoles, operatorRole, operatorId);
    } else if (dto.brandIds !== undefined && dto.role !== 'ADMIN') {
      await this.syncBrandMembers(
        id,
        dto.brandIds.map((brandId) => ({
          brandId,
          roleKey: 'agency_executive',
        })),
        operatorRole,
      );
    }

    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  private async syncBrandMembers(
    userId: number,
    brandRoles: { brandId: number; roleKey: string }[],
    operatorRole?: string,
    operatorId?: number,
  ) {
    // 非超管只能在自己所属品牌范围内分配
    let allowed: Set<number> | null = null;
    if (operatorRole && operatorRole !== 'ADMIN' && operatorId) {
      const mine = await this.prisma.brandMember.findMany({
        where: { userId: operatorId },
        select: { brandId: true },
      });
      allowed = new Set(mine.map((m) => m.brandId));
    }
    const next = new Map(brandRoles.map((r) => [r.brandId, r.roleKey]));
    const current = await this.prisma.brandMember.findMany({
      where: { userId },
    });
    for (const m of current) {
      if (allowed && !allowed.has(m.brandId)) continue;
      if (!next.has(m.brandId)) {
        await this.prisma.brandMember.delete({ where: { id: m.id } });
      } else if (next.get(m.brandId) !== m.roleKey) {
        await this.prisma.brandMember.delete({ where: { id: m.id } });
      }
    }
    for (const [brandId, roleKey] of next) {
      if (allowed && !allowed.has(brandId)) continue;
      const exists = current.some(
        (m) => m.brandId === brandId && m.roleKey === roleKey,
      );
      if (!exists) {
        await this.prisma.brandMember.create({
          data: { brandId, userId, roleKey },
        });
      }
    }
  }

  async resetPassword(operatorId: number, id: number, dto: ResetPasswordDto) {
    const operatorRole = await this.assertOperator(operatorId);
    await this.assertCanTouch(operatorRole, operatorId, id);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: bcrypt.hashSync(this.sha1(dto.password), 10) },
    });
    return { ok: true };
  }

  /**
   * 批量开通（4级账号体系）：手机号即登录账号。
   * 每行独立处理，单行失败不影响其余行；已存在手机号视为更新（昵称/组织/品牌角色/绑定）。
   * 缺省密码 = passwordPrefix(默认 Mdd@) + 手机号后 4 位。
   */
  async createUsersBatch(operatorId: number, dto: BatchCreateUsersDto) {
    const operatorRole = await this.assertOperator(operatorId);
    // 非超管：只能在自有品牌范围内分配 + 不能建 ADMIN
    let allowedBrands: Set<number> | null = null;
    if (operatorRole !== 'ADMIN') {
      const mine = await this.prisma.brandMember.findMany({
        where: { userId: operatorId },
        select: { brandId: true },
      });
      allowedBrands = new Set(mine.map((m) => m.brandId));
    }

    const prefix = dto.passwordPrefix ?? 'Mdd@';
    const result = {
      total: dto.rows.length,
      added: 0,
      updated: 0,
      failed: 0,
      errors: [] as { phone: string; reason: string }[],
      credentials: [] as {
        phone: string;
        password: string;
        nickname: string;
        brandIds: number[];
        orgName?: string;
        kosNickname?: string;
      }[],
    };

    for (const row of dto.rows) {
      try {
        if (operatorRole !== 'ADMIN' && row.role === 'ADMIN') {
          throw new ForbiddenException('仅超级管理员可创建管理员账号');
        }
        const brandRoles = (row.brandRoles ?? []).filter(
          (r) => !allowedBrands || allowedBrands.has(r.brandId),
        );
        const primaryBrand = brandRoles[0]?.brandId ?? null;

        // 组织：优先 orgId，其次按名称 find-or-create（门店层级）
        let orgId: number | null = row.orgId ?? null;
        if (!orgId && row.orgName && primaryBrand) {
          const level = row.orgLevel ?? 3;
          let org = await this.prisma.brandOrg.findFirst({
            where: { brandId: primaryBrand, name: row.orgName, level },
            select: { id: true },
          });
          if (!org) {
            org = await this.prisma.brandOrg.create({
              data: { brandId: primaryBrand, name: row.orgName, level },
              select: { id: true },
            });
          }
          orgId = org.id;
        }

        const exists = await this.prisma.user.findUnique({
          where: { phone: row.phone },
          select: { id: true },
        });
        const password = row.password ?? `${prefix}${row.phone.slice(-4)}`;
        let userId: number;
        if (exists) {
          await this.prisma.user.update({
            where: { id: exists.id },
            data: {
              ...(row.nickname !== undefined ? { nickname: row.nickname } : {}),
              ...(row.moduleIds !== undefined ? { moduleIds: row.moduleIds } : {}),
              ...(orgId ? { orgId } : {}),
              ...(row.password ? { passwordHash: bcrypt.hashSync(this.sha1(row.password), 10) } : {}),
            },
          });
          userId = exists.id;
          result.updated += 1;
        } else {
          const created = await this.prisma.user.create({
            data: {
              phone: row.phone,
              passwordHash: bcrypt.hashSync(this.sha1(password), 10),
              nickname: row.nickname || row.phone,
              role: row.role ?? 'SALES',
              adminFlag: row.role === 'ADMIN' ? 1 : 0,
              companyId: 1,
              moduleIds: row.moduleIds ?? [],
              createdById: operatorId,
              ...(orgId ? { orgId } : {}),
            },
            select: { id: true },
          });
          userId = created.id;
          result.added += 1;
        }

        // 品牌角色（幂等 upsert）
        for (const r of brandRoles) {
          await this.prisma.brandMember.upsert({
            where: {
              brandId_userId_roleKey: {
                brandId: r.brandId,
                userId,
                roleKey: r.roleKey,
              },
            },
            update: {},
            create: { brandId: r.brandId, userId, roleKey: r.roleKey },
          });
        }

        // KOS 矩阵账号绑定（1:1）
        let kosNickname: string | undefined;
        if (row.kosNickname && primaryBrand) {
          const kos = await this.prisma.kosAccount.findFirst({
            where: { brandId: primaryBrand, nickname: row.kosNickname },
            select: { id: true, userId: true },
          });
          if (!kos) throw new BadRequestException(`矩阵账号不存在: ${row.kosNickname}`);
          if (kos.userId && kos.userId !== userId) {
            throw new BadRequestException(`矩阵账号已被其他账号绑定: ${row.kosNickname}`);
          }
          await this.prisma.kosAccount.update({
            where: { id: kos.id },
            data: { userId },
          });
          kosNickname = row.kosNickname;
        }

        if (!exists || row.password) {
          result.credentials.push({
            phone: row.phone,
            password: exists && !row.password ? '' : password,
            nickname: row.nickname || row.phone,
            brandIds: brandRoles.map((r) => r.brandId),
            orgName: row.orgName,
            kosNickname,
          });
        }
      } catch (e) {
        result.failed += 1;
        result.errors.push({
          phone: row.phone,
          reason: e?.message ?? String(e),
        });
      }
    }
    return result;
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
