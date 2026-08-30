import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchTaskDto,
  MaterialDto,
  MaterialUpdateDto,
  MoveProductDto,
  PackageDto,
  ProductDto,
  ReviewDto,
} from './dto/content.dto';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProduct(p: any, depth = 0): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    display_name: p.displayName ?? p.name,
    type: p.configType,
    parent_id: p.parentId,
    description: p.description,
    knowledge: p.knowledge,
    basic_info: {
      knowledge: p.knowledge,
      sales_policy: p.salesPolicy,
      faq: p.faq,
    },
    children:
      depth < 3 ? (p.children ?? []).map((c: any) => mapProduct(c, depth + 1)) : [],
  };
}

const REVIEW_TARGETS = ['pending_review', 'approved', 'brand_approved', 'rejected'];

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async products(brandId = 1) {
    const nodes = await this.prisma.product.findMany({
      where: { brandId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { children: { include: { children: true } } },
    });
    return nodes
      .filter((n) => n.parentId === null)
      .map((n) => mapProduct(n));
  }

  async createProduct(dto: ProductDto, brandId = 1) {
    if (dto.parentId != null) {
      const parent = await this.prisma.product.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('父节点不存在');
      if (parent.parentId != null && parent.configType !== 'strategy_card') {
        throw new BadRequestException('产品树最多三级');
      }
    }
    const maxSort = await this.prisma.product.aggregate({
      where: { parentId: dto.parentId ?? null, brandId },
      _max: { sort: true },
    });
    const product = await this.prisma.product.create({
      data: {
        parentId: dto.parentId ?? null,
        name: dto.name,
        displayName: dto.displayName ?? dto.name,
        configType: dto.configType ?? 'product',
        description: dto.description,
        knowledge: dto.knowledge,
        salesPolicy: dto.salesPolicy,
        faq: dto.faq,
        brandId,
        sort: (maxSort._max.sort ?? 0) + 1,
      },
    });
    return { id: product.id, name: product.name };
  }

  async updateProduct(id: number, dto: ProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('产品节点不存在');
    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.knowledge !== undefined ? { knowledge: dto.knowledge } : {}),
        ...(dto.salesPolicy !== undefined ? { salesPolicy: dto.salesPolicy } : {}),
        ...(dto.faq !== undefined ? { faq: dto.faq } : {}),
        ...(dto.configType !== undefined ? { configType: dto.configType } : {}),
      },
    });
    return { id };
  }

  async deleteProduct(id: number) {
    const count = await this.prisma.product.count({ where: { parentId: id } });
    if (count > 0) throw new BadRequestException('请先删除子节点');
    const pkgCount = await this.prisma.contentPackage.count({
      where: { productId: id },
    });
    if (pkgCount > 0) throw new BadRequestException('该产品已关联内容包');
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  async moveProduct(id: number, dto: MoveProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('产品节点不存在');
    const siblings = await this.prisma.product.findMany({
      where: { parentId: product.parentId, brandId: product.brandId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const idx = siblings.findIndex((s) => s.id === id);
    const swapIdx = dto.direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) {
      throw new BadRequestException('已在边界');
    }
    const a = siblings[idx];
    const b = siblings[swapIdx];
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: a.id }, data: { sort: b.sort || b.id } }),
      this.prisma.product.update({ where: { id: b.id }, data: { sort: a.sort || a.id } }),
    ]);
    return { id };
  }

  async overview(brandId = 1) {
    const [products, packages, materials, tasks] = await Promise.all([
      this.prisma.product.count({ where: { brandId } }),
      this.prisma.contentPackage.count({ where: { brandId } }),
      this.prisma.packageMaterial.findMany({
        where: { package: { brandId } },
        select: { status: true },
      }),
      this.prisma.batchTask.findMany({
        where: { createdById: { not: 0 } },
        select: { status: true, successCount: true, failedCount: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const m of materials) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;

    const strategyCards = await this.prisma.product.count({
      where: { configType: 'strategy_card' },
    });
    const scenes = await this.prisma.product.count({
      where: { configType: 'scene' },
    });

    return {
      product_count: products,
      strategy_card_count: strategyCards,
      scene_count: scenes,
      package_count: packages,
      content_total: materials.length,
      content_breakdown: {
        draft: byStatus.draft ?? 0,
        pending_review: byStatus.pending_review ?? 0,
        approved: byStatus.approved ?? 0,
        brand_approved: byStatus.brand_approved ?? 0,
        rejected: byStatus.rejected ?? 0,
        used: byStatus.used ?? 0,
      },
      recent_tasks: tasks.map((t) => ({
        status: t.status,
        success_count: t.successCount,
        failed_count: t.failedCount,
      })),
      running_tasks: await this.prisma.batchTask.count({
        where: { status: { in: ['pending', 'running'] } },
      }),
    };
  }

  async packages(query: {
    page?: string;
    pageSize?: string;
    keyword?: string;
    brandId?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.pageSize ?? 12) || 12);
    const where: Prisma.ContentPackageWhereInput = {};
    if (query.brandId) where.brandId = Number(query.brandId);
    if (query.keyword) {
      where.name = { contains: query.keyword, mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      this.prisma.contentPackage.count({ where }),
      this.prisma.contentPackage.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true } },
          _count: { select: { materials: true } },
          materials: { select: { status: true } },
        },
      }),
    ]);

    return {
      list: rows.map((p) => {
        const stats: Record<string, number> = {};
        for (const m of p.materials) {
          stats[m.status] = (stats[m.status] ?? 0) + 1;
        }
        return {
          package_id: p.id,
          name: p.name,
          workflow_type: p.workflowType,
          product_id: p.productId,
          product_name: p.product?.name ?? null,
          review_mode: p.reviewMode,
          updated_time: p.updatedAt,
          stats: {
            content_total: p._count.materials,
            draft: stats.draft ?? 0,
            pending_review: stats.pending_review ?? 0,
            approved: stats.approved ?? 0,
            brand_approved: stats.brand_approved ?? 0,
            rejected: stats.rejected ?? 0,
          },
        };
      }),
      total,
      page,
      page_size: pageSize,
    };
  }

  async createPackage(dto: PackageDto, userId: number, brandId = 1) {
    const pkg = await this.prisma.contentPackage.create({
      data: {
        name: dto.name,
        workflowType: dto.workflowType ?? 'pro',
        productId: dto.productId ?? null,
        reviewMode: dto.reviewMode ?? 1,
        brandId,
        createdById: userId,
      },
    });
    return { package_id: pkg.id, name: pkg.name };
  }

  async updatePackage(id: number, dto: PackageDto) {
    const pkg = await this.prisma.contentPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('内容包不存在');
    await this.prisma.contentPackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.productId !== undefined ? { productId: dto.productId } : {}),
        ...(dto.reviewMode !== undefined ? { reviewMode: dto.reviewMode } : {}),
        ...(dto.workflowType !== undefined ? { workflowType: dto.workflowType } : {}),
      },
    });
    return { package_id: id };
  }

  async deletePackage(id: number) {
    const pkg = await this.prisma.contentPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('内容包不存在');
    await this.prisma.contentPackage.delete({ where: { id } });
    return { id };
  }

  async materials(packageId: number, query: { status?: string }) {
    const pkg = await this.prisma.contentPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('内容包不存在');
    const where: Prisma.PackageMaterialWhereInput = { packageId };
    if (query.status) where.status = query.status;

    const rows = await this.prisma.packageMaterial.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return {
      list: rows.map((m) => ({
        id: m.id,
        package_id: m.packageId,
        title: m.title,
        content: m.content,
        tags: m.tags,
        content_form: m.contentForm,
        images: m.images,
        status: m.status,
        conversation_id: m.conversationId,
        review_comment: m.reviewComment,
        updated_time: m.updatedAt,
      })),
      total: rows.length,
    };
  }

  async addMaterial(packageId: number, dto: MaterialDto) {
    const pkg = await this.prisma.contentPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('内容包不存在');
    const material = await this.prisma.packageMaterial.create({
      data: {
        packageId,
        title: dto.title,
        content: dto.content,
        tags: dto.tags ?? [],
        contentForm: dto.contentForm ?? 'image_text',
      },
    });
    return { id: material.id };
  }

  async updateMaterial(id: number, dto: MaterialUpdateDto) {
    const material = await this.prisma.packageMaterial.findUnique({
      where: { id },
    });
    if (!material) throw new NotFoundException('内容不存在');
    if (!REVIEW_TARGETS.includes(material.status) && material.status !== 'draft') {
      throw new BadRequestException('当前状态不可编辑');
    }
    await this.prisma.packageMaterial.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        status: 'draft',
      },
    });
    return { id };
  }

  async deleteMaterial(id: number) {
    const material = await this.prisma.packageMaterial.findUnique({
      where: { id },
    });
    if (!material) throw new NotFoundException('内容不存在');
    await this.prisma.packageMaterial.delete({ where: { id } });
    return { id };
  }

  async submitMaterials(ids: number[]) {
    const updated = await this.prisma.packageMaterial.updateMany({
      where: { id: { in: ids }, status: { in: ['draft', 'rejected'] } },
      data: { status: 'pending_review', reviewComment: null },
    });
    return { submitted: updated.count };
  }

  async reviewMaterial(id: number, action: 'approve' | 'reject', dto: ReviewDto) {
    const material = await this.prisma.packageMaterial.findUnique({
      where: { id },
      include: { package: true },
    });
    if (!material) throw new NotFoundException('内容不存在');
    if (material.status !== 'pending_review') {
      throw new BadRequestException('该内容不在待审核状态');
    }
    const twoPhase = material.package.reviewMode === 2;
    const nextStatus =
      action === 'approve'
        ? twoPhase
          ? 'approved'
          : 'brand_approved'
        : 'rejected';
    await this.prisma.packageMaterial.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewComment: dto.comment ?? null,
        reviewedAt: new Date(),
      },
    });
    return { id, status: nextStatus };
  }

  async brandReview(id: number, action: 'brand-approve' | 'brand-reject', dto: ReviewDto) {
    const material = await this.prisma.packageMaterial.findUnique({
      where: { id },
    });
    if (!material) throw new NotFoundException('内容不存在');
    if (material.status !== 'approved') {
      throw new BadRequestException('仅运营已通过的内容可进行品牌审核');
    }
    const nextStatus = action === 'brand-approve' ? 'brand_approved' : 'rejected';
    await this.prisma.packageMaterial.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewComment: dto.comment ?? null,
        reviewedAt: new Date(),
      },
    });
    return { id, status: nextStatus };
  }

  async batchTasks(query: { page?: string; page_size?: string; status?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.page_size ?? 20) || 20);
    const where: Prisma.BatchTaskWhereInput = {};
    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.batchTask.count({ where }),
      this.prisma.batchTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, displayName: true, name: true } },
        },
      }),
    ]);

    return {
      list: rows.map((t) => ({
        id: t.id,
        task_name: t.taskName,
        status: t.status,
        product_id: t.productId,
        product_display_name: t.product?.displayName ?? t.product?.name ?? null,
        target_quantity: t.targetQty,
        success_count: t.successCount,
        failed_count: t.failedCount,
        model: t.model,
        package_id: t.packageId,
        created_at: t.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async createBatchTask(dto: BatchTaskDto, userId: number) {
    const task = await this.prisma.batchTask.create({
      data: {
        taskName: dto.taskName,
        status: 'pending',
        productId: dto.productId ?? null,
        targetQty: dto.targetQuantity,
        packageId: dto.packageId ?? null,
        model: dto.model ?? 'random',
        createdById: userId,
      },
    });

    this.simulateGeneration(task.id).catch(() => undefined);
    return { id: task.id, status: 'pending' };
  }

  private async simulateGeneration(taskId: number) {
    const task = await this.prisma.batchTask.findUnique({
      where: { id: taskId },
    });
    if (!task) return;
    await this.prisma.batchTask.update({
      where: { id: taskId },
      data: { status: 'running' },
    });

    const product = task.productId
      ? await this.prisma.product.findUnique({ where: { id: task.productId } })
      : null;
    const productName = product?.displayName ?? product?.name ?? '通用产品';

    const hooks = [
      '真实体验分享',
      '避坑指南',
      '新手必看',
      '宝藏好物推荐',
      '一个月使用报告',
      '闭眼入清单',
      '闺蜜问我链接的',
      '回购三次的理由',
    ];
    const angles = [
      '从踩雷到真香的完整心路历程',
      '预算有限怎么选最划算',
      '不同场景下的实际表现',
      '和上一代对比到底升级了什么',
      '小白三分钟看懂的选购攻略',
    ];

    let success = 0;
    let failed = 0;
    for (let i = 0; i < task.targetQty; i++) {
      if (task.packageId) {
        const pkg = await this.prisma.contentPackage.findUnique({
          where: { id: task.packageId },
        });
        if (!pkg) break;
        const hook = hooks[i % hooks.length];
        const angle = angles[i % angles.length];
        const title = `${productName}｜${hook}`;
        const content = `今天来聊聊${productName}。\n\n${angle}，这篇一次性讲清楚。\n\n先说结论：值得入手，但有几个细节要注意👇\n\n1️⃣ 外观设计：质感在线，放在家里任何角落都不违和\n2️⃣ 实际体验：连续使用${3 + (i % 5)}周，稳定性超出预期\n3️⃣ 性价比：同价位段几乎找不到对手\n\n⚠️ 小提醒：入手前记得确认自己的使用场景，别盲目跟风～\n\n有问题评论区问我，看到都会回！\n\n#${productName} #好物推荐 #真实测评`;
        try {
          await this.prisma.packageMaterial.create({
            data: {
              packageId: task.packageId,
              title,
              content,
              tags: [productName, '好物推荐', '真实测评'],
              contentForm: 'image_text',
              status: 'draft',
              conversationId: `task_${taskId}_item_${i}`,
            },
          });
          success++;
        } catch {
          failed++;
        }
      } else {
        failed++;
      }
      await this.prisma.batchTask.update({
        where: { id: taskId },
        data: { successCount: success, failedCount: failed },
      });
    }

    await this.prisma.batchTask.update({
      where: { id: taskId },
      data: {
        status:
          failed === 0 ? 'completed' : success > 0 ? 'partial_failed' : 'failed',
      },
    });
  }

  async cancelBatchTask(id: number) {
    const task = await this.prisma.batchTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (!['pending', 'running'].includes(task.status)) {
      throw new BadRequestException('任务已结束');
    }
    await this.prisma.batchTask.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    return { id, status: 'cancelled' };
  }
}
