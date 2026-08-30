import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFolderDto,
  CreateProjectDto,
  UpdateFolderDto,
  UpdateProjectDto,
} from './dto/project.dto';

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v));
  return Number.isNaN(n) ? 0 : n;
};

const MANAGE_ROLES = ['agency_manager', 'brand_owner', 'project_manager'];

type ProjectWithStats = Prisma.ProjectGetPayload<{
  include: {
    stats: true;
    owner: { select: { id: true; nickname: true; name: true } };
    folder: true;
  };
}>;

function mapProject(p: ProjectWithStats) {
  const s = p.stats;
  return {
    id: p.id,
    project_code: p.projectCode,
    name: p.name,
    client_name: p.clientName,
    description: p.description,
    folder_id: p.folderId,
    folder_name: p.folder?.name ?? null,
    brief: {},
    product_id: p.productId,
    targets: {},
    budget_total: num(p.budgetTotal),
    service_fee_enabled: p.serviceFeeEnabled,
    service_fee_rate: num(p.serviceFeeRate),
    tax_fee_enabled: p.taxFeeEnabled,
    tax_fee_rate: num(p.taxFeeRate),
    status: p.status,
    phase: p.phase,
    start_date: p.startDate,
    end_date: p.endDate,
    owner_user_id: p.ownerId,
    owner_name: p.owner?.nickname ?? p.owner?.name ?? '',
    version: p.version,
    created_by: p.createdById,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    archived_at: p.archivedAt,
    progress: {
      deliverable_count: s?.deliverableCount ?? 0,
      planned_quantity: s?.plannedQuantity ?? 0,
      completed_quantity: s?.completedQuantity ?? 0,
      planned_cost: num(s?.plannedCost),
      actual_cost: num(s?.actualCost),
      accepted_count: s?.acceptedCount ?? 0,
      risk_count: s?.riskCount ?? 0,
      relation_count: s?.relationCount ?? 0,
      completion_rate:
        s && s.plannedQuantity > 0
          ? Math.round((s.completedQuantity / s.plannedQuantity) * 100)
          : 0,
    },
    quote: {
      draft_amount: num(s?.quoteDraftAmount),
      collaboration_status: s?.quoteCollaborationStatus ?? 'not_configured',
      cost_completed_count: s?.costCompletedCount ?? 0,
      cost_expected_count: s?.costExpectedCount ?? 0,
      cost_complete:
        !!s &&
        s.costExpectedCount > 0 &&
        s.costCompletedCount >= s.costExpectedCount,
    },
    talent: {
      sheet_count: s?.sheetCount ?? 0,
      total_count: s?.talentTotal ?? 0,
      formal_count: s?.formalCount ?? 0,
      backup_count: s?.backupCount ?? 0,
      approved_count: s?.approvedCount ?? 0,
      pending_count: s?.pendingCount ?? 0,
      rejected_count: s?.rejectedCount ?? 0,
      unavailable_count: s?.unavailableCount ?? 0,
    },
    execution: {
      total_count: s?.executionTotal ?? 0,
      attention_count: s && s.attentionLevel !== 'none' ? 1 : 0,
      ready_to_start_count: s?.readyToStart ?? 0,
      draft_count: s?.draftCount ?? 0,
      revision_required_count: s?.revisionRequired ?? 0,
      internal_review_count: s?.internalReview ?? 0,
      brand_review_count: s?.brandReview ?? 0,
      ready_to_publish_count: s?.readyToPublish ?? 0,
      review_count: (s?.internalReview ?? 0) + (s?.brandReview ?? 0),
      creator_action_count: (s?.draftCount ?? 0) + (s?.revisionRequired ?? 0),
      published_count: s?.publishedCount ?? 0,
      overdue_count: s?.overdueCount ?? 0,
      tracking_issue_count: 0,
      attention_items: [],
      attention_label: s?.attentionLabel ?? '暂无待办',
      attention_creator_name: s?.attentionCreator ?? null,
      attention_level: s?.attentionLevel ?? 'none',
    },
  };
}

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  async workspaces(userId: number) {
    const brands = await this.prisma.brand.findMany({
      where: { status: 1 },
      orderBy: { id: 'asc' },
      include: {
        members: { where: { userId } },
        _count: { select: { members: true } },
      },
    });

    const counts = await this.prisma.project.groupBy({
      by: ['brandId'],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.brandId, c._count._all]));

    return {
      list: brands.map((b) => ({
        id: b.id,
        brand_id: b.id,
        name: b.name,
        logo: b.logo,
        role: b.members[0]?.roleKey ?? '',
        role_key: b.members[0]?.roleKey ?? '',
        can_manage: MANAGE_ROLES.includes(b.members[0]?.roleKey ?? ''),
        project_count: countMap.get(b.id) ?? 0,
      })),
    };
  }

  async workspace(userId: number, brandId?: number) {
    const brand =
      brandId != null
        ? await this.prisma.brand.findUnique({ where: { id: brandId } })
        : await this.prisma.brand.findFirst({ where: { status: 1 } });
    if (!brand) throw new NotFoundException('工作区不存在');

    const member = await this.prisma.brandMember.findFirst({
      where: { userId, brandId: brand.id },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const grouped = await this.prisma.project.groupBy({
      by: ['status'],
      where: { brandId: brand.id },
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      statusCounts[g.status] = g._count._all;
      total += g._count._all;
    }

    return {
      main_company_id: user?.companyId ?? 1,
      brand_id: brand.id,
      brand_name: brand.name,
      role: member?.roleKey ?? '',
      can_manage: MANAGE_ROLES.includes(member?.roleKey ?? ''),
      project_count: total,
      status_counts: statusCounts,
    };
  }

  async folders(brandId = 1) {
    const nodes = await this.prisma.projectFolder.findMany({
      where: { brandId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { projects: true } } },
    });

    const byParent = new Map<number | null, typeof nodes>();
    for (const node of nodes) {
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }

    const build = (parentId: null | number): unknown[] =>
      (byParent.get(parentId) ?? []).map((node) => ({
        id: node.id,
        parent_id: node.parentId,
        name: node.name,
        sort: node.sort,
        status: node.status,
        project_count: node._count.projects,
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        children: build(node.id),
      }));

    return build(null);
  }

  async createFolder(dto: CreateFolderDto, brandId = 1) {
    if (dto.parentId != null) {
      const parent = await this.prisma.projectFolder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('父文件夹不存在');
      if (parent.parentId != null) {
        throw new BadRequestException('仅支持两级文件夹');
      }
    }
    const folder = await this.prisma.projectFolder.create({
      data: { name: dto.name, parentId: dto.parentId ?? null, brandId },
    });
    return { id: folder.id, name: folder.name };
  }

  async updateFolder(id: number, dto: UpdateFolderDto) {
    const folder = await this.prisma.projectFolder.findUnique({
      where: { id },
    });
    if (!folder) throw new NotFoundException('文件夹不存在');
    await this.prisma.projectFolder.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
    return { id };
  }

  async deleteFolder(id: number) {
    const folder = await this.prisma.projectFolder.findUnique({
      where: { id },
      include: { _count: { select: { projects: true, children: true } } },
    });
    if (!folder) throw new NotFoundException('文件夹不存在');
    if (folder._count.children > 0) {
      throw new BadRequestException('文件夹下存在子文件夹，无法删除');
    }
    await this.prisma.projectFolder.delete({ where: { id } });
    return { id };
  }

  async members(userId: number) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    const users = await this.prisma.user.findMany({
      where: { companyId: me?.companyId ?? 1 },
      select: { id: true, nickname: true, name: true, phone: true },
      orderBy: { id: 'asc' },
    });
    return {
      list: users.map((u) => ({
        id: u.id,
        nickname: u.nickname ?? u.name ?? u.phone,
      })),
    };
  }

  async list(query: {
    page?: string;
    page_size?: string;
    folder_id?: string;
    status?: string;
    keyword?: string;
    owner_id?: string;
    brand_id?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 20) || 20);

    const where: Prisma.ProjectWhereInput = {};
    if (query.brand_id) where.brandId = Number(query.brand_id);
    if (query.status) where.status = query.status;
    if (query.owner_id) where.ownerId = Number(query.owner_id);
    if (query.folder_id === '0') {
      where.folderId = null;
    } else if (query.folder_id) {
      where.folderId = Number(query.folder_id);
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { projectCode: { contains: query.keyword, mode: 'insensitive' } },
        { clientName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          stats: true,
          owner: { select: { id: true, nickname: true, name: true } },
          folder: true,
        },
      }),
    ]);

    return {
      list: projects.map(mapProject),
      total,
      page,
      page_size: pageSize,
    };
  }

  private async nextProjectCode() {
    const year = new Date().getFullYear();
    const count = await this.prisma.project.count();
    let seq = count + 1;
    for (let i = 0; i < 50; i++) {
      const code = `PRJ-${year}-${String(seq).padStart(4, '0')}`;
      const exists = await this.prisma.project.findUnique({
        where: { projectCode: code },
      });
      if (!exists) return code;
      seq++;
    }
    return `PRJ-${year}-${Date.now().toString().slice(-6)}`;
  }

  async create(dto: CreateProjectDto, userId: number) {
    const projectCode = await this.nextProjectCode();
    const project = await this.prisma.project.create({
      data: {
        projectCode,
        name: dto.name,
        clientName: dto.clientName,
        description: dto.description,
        folderId: dto.folderId ?? null,
        ownerId: dto.ownerId ?? userId,
        createdById: userId,
        phase: dto.phase ?? 'planning',
        status: dto.status ?? 'draft',
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        budgetTotal: dto.budgetTotal ?? 0,
        serviceFeeEnabled: dto.serviceFeeEnabled ?? false,
        serviceFeeRate: dto.serviceFeeRate ?? 0,
        taxFeeEnabled: dto.taxFeeEnabled ?? false,
        taxFeeRate: dto.taxFeeRate ?? 0,
        stats: { create: {} },
      },
      include: {
        stats: true,
        owner: { select: { id: true, nickname: true, name: true } },
        folder: true,
      },
    });
    return mapProject(project);
  }

  async detail(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        stats: true,
        owner: { select: { id: true, nickname: true, name: true } },
        folder: true,
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    return mapProject(project);
  }

  async update(id: number, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('项目不存在');

    const data: Prisma.ProjectUpdateInput = { version: project.version + 1 };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.phase !== undefined) data.phase = dto.phase;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.archivedAt = dto.status === 'archived' ? new Date() : null;
    }
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.budgetTotal !== undefined) data.budgetTotal = dto.budgetTotal;
    if (dto.serviceFeeEnabled !== undefined)
      data.serviceFeeEnabled = dto.serviceFeeEnabled;
    if (dto.serviceFeeRate !== undefined)
      data.serviceFeeRate = dto.serviceFeeRate;
    if (dto.taxFeeEnabled !== undefined) data.taxFeeEnabled = dto.taxFeeEnabled;
    if (dto.taxFeeRate !== undefined) data.taxFeeRate = dto.taxFeeRate;
    if (dto.folderId !== undefined) {
      data.folder =
        dto.folderId == null
          ? { disconnect: true }
          : { connect: { id: dto.folderId } };
    }
    if (dto.ownerId !== undefined) {
      data.owner = { connect: { id: dto.ownerId } };
    }

    await this.prisma.project.update({ where: { id }, data });
    return this.detail(id);
  }

  async remove(id: number) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('项目不存在');
    await this.prisma.project.delete({ where: { id } });
    return { id };
  }

  async archive(id: number, archived: boolean) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('项目不存在');
    await this.prisma.project.update({
      where: { id },
      data: archived
        ? { status: 'archived', archivedAt: new Date() }
        : { status: 'active', archivedAt: null },
    });
    return this.detail(id);
  }
}
