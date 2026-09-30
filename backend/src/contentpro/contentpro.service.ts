import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';

@Injectable()
export class ContentproService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
  ) {}

  // ─── 素材库 ────────────────────────────────────────────────────────
  async tags(brandId: number) {
    const [list, counts] = await Promise.all([
      this.prisma.materialTypeTag.findMany({
        where: { brandId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.materialImage.groupBy({
        by: ['typeId'],
        where: { brandId, typeId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.typeId, c._count._all]));
    return {
      list: list.map((t) => ({ ...t, image_count: countMap.get(t.id) ?? 0 })),
      total: list.length,
    };
  }

  async createTag(brandId: number, dto: { name: string; parentId?: number; status?: number }) {
    const exists = await this.prisma.materialTypeTag.findFirst({ where: { brandId, name: dto.name } });
    if (exists) throw new BadRequestException('同名标签已存在');
    return this.prisma.materialTypeTag.create({
      data: { brandId, name: dto.name, parentId: dto.parentId ?? 0, status: dto.status ?? 1 },
    });
  }

  async updateTag(id: number, dto: { name?: string; status?: number }) {
    await this.prisma.materialTypeTag.update({ where: { id }, data: dto });
    return { id };
  }

  async deleteTags(ids: number[]) {
    await this.prisma.materialTypeTag.deleteMany({ where: { id: { in: ids } } });
    return { deleted: ids.length };
  }

  async sets(brandId: number) {
    const [list, counts] = await Promise.all([
      this.prisma.materialImageSet.findMany({ where: { brandId }, orderBy: { id: 'asc' } }),
      this.prisma.materialImage.groupBy({
        by: ['setId'],
        where: { brandId, setId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.setId, c._count._all]));
    return {
      list: list.map((s) => ({ ...s, image_count: countMap.get(s.id) ?? 0 })),
      total: list.length,
    };
  }

  async createSet(brandId: number, dto: { name: string; status?: number }) {
    const exists = await this.prisma.materialImageSet.findFirst({ where: { brandId, name: dto.name } });
    if (exists) throw new BadRequestException('同名套图已存在');
    return this.prisma.materialImageSet.create({ data: { brandId, name: dto.name, status: dto.status ?? 1 } });
  }

  async updateSet(id: number, dto: { name?: string; status?: number }) {
    await this.prisma.materialImageSet.update({ where: { id }, data: dto });
    return { id };
  }

  async deleteSets(ids: number[]) {
    await this.prisma.materialImageSet.deleteMany({ where: { id: { in: ids } } });
    return { deleted: ids.length };
  }

  async images(query: {
    brandId: number;
    setId?: string;
    typeId?: string;
    unassigned?: string;
    keyword?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.pageSize ?? 30) || 30);
    const where: Prisma.MaterialImageWhereInput = { brandId: query.brandId };
    if (query.setId) where.setId = Number(query.setId);
    if (query.typeId) where.typeId = Number(query.typeId);
    if (query.unassigned === '1') where.AND = [{ setId: null }, { typeId: null }];
    if (query.keyword) where.name = { contains: query.keyword, mode: 'insensitive' };
    const [total, rows] = await Promise.all([
      this.prisma.materialImage.count({ where }),
      this.prisma.materialImage.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { set: { select: { name: true } }, type: { select: { name: true } } },
      }),
    ]);
    return {
      list: rows.map((r) => ({
        id: r.id,
        url: r.url,
        name: r.name,
        set_id: r.setId,
        set_name: r.set?.name ?? null,
        type_id: r.typeId,
        type_name: r.type?.name ?? null,
        product_node_id: r.productNodeId,
        created_at: r.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async importImages(brandId: number, dto: { urls: string[]; setId?: number | null; typeId?: number | null; productNodeId?: number | null }) {
    let added = 0;
    for (const url of dto.urls) {
      if (!/^https?:\/\//.test(url)) continue;
      const exists = await this.prisma.materialImage.findFirst({ where: { brandId, url } });
      if (exists) continue;
      await this.prisma.materialImage.create({
        data: {
          brandId,
          url,
          name: decodeURIComponent(url.split('/').pop() ?? '素材图').slice(0, 80),
          setId: dto.setId ?? null,
          typeId: dto.typeId ?? null,
          productNodeId: dto.productNodeId ?? null,
        },
      });
      added++;
    }
    return { added };
  }

  async updateImage(id: number, dto: { name?: string; setId?: number | null; typeId?: number | null; productNodeId?: number | null }) {
    await this.prisma.materialImage.update({ where: { id }, data: dto });
    return { id };
  }

  async deleteImages(ids: number[]) {
    await this.prisma.materialImage.deleteMany({ where: { id: { in: ids } } });
    return { deleted: ids.length };
  }

  async assignImages(dto: { ids: number[]; setId?: number | null; typeId?: number | null }) {
    const data: { setId?: number | null; typeId?: number | null } = {};
    if (dto.setId !== undefined) data.setId = dto.setId;
    if (dto.typeId !== undefined) data.typeId = dto.typeId;
    for (const id of dto.ids) {
      await this.prisma.materialImage.update({ where: { id }, data });
    }
    return { updated: dto.ids.length };
  }

  // ─── 创作策略 ──────────────────────────────────────────────────────
  async strategies(brandId: number) {
    const list = await this.prisma.writingStrategy.findMany({
      where: { brandId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return {
      list: list.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        persona: (s.persona as unknown as string[]) ?? [],
        selling_points: (s.sellingPoints as unknown as string[]) ?? [],
        audience: (s.audience as unknown as string[]) ?? [],
        content_directions: (s.contentDirections as unknown as { name: string; description?: string }[]) ?? [],
        enabled: s.enabled,
        sort: s.sort,
        product_id: s.productId,
      })),
      total: list.length,
    };
  }

  async createStrategy(brandId: number, dto: Record<string, unknown>, userId: number) {
    return this.prisma.writingStrategy.create({
      data: {
        brandId,
        name: String(dto.name),
        description: (dto.description as string) ?? null,
        persona: (dto.persona as string[]) ?? [],
        sellingPoints: (dto.selling_points as string[]) ?? (dto.sellingPoints as string[]) ?? [],
        audience: (dto.audience as string[]) ?? [],
        contentDirections: (dto.content_directions as unknown) ?? (dto.contentDirections as unknown) ?? [],
        enabled: dto.enabled === undefined ? true : Boolean(dto.enabled),
        sort: Number(dto.sort ?? 99),
        productId: dto.productId ? Number(dto.productId) : null,
        createdById: userId,
      },
    });
  }

  async updateStrategy(id: number, dto: Record<string, unknown>) {
    const data: Prisma.WritingStrategyUpdateInput = {};
    if (dto.name !== undefined) data.name = String(dto.name);
    if (dto.description !== undefined) data.description = String(dto.description);
    if (dto.persona !== undefined) data.persona = dto.persona as string[];
    if (dto.selling_points !== undefined || dto.sellingPoints !== undefined) {
      data.sellingPoints = (dto.selling_points ?? dto.sellingPoints) as string[];
    }
    if (dto.audience !== undefined) data.audience = dto.audience as string[];
    if (dto.content_directions !== undefined || dto.contentDirections !== undefined) {
      data.contentDirections = (dto.content_directions ?? dto.contentDirections) as unknown as Prisma.InputJsonValue;
    }
    if (dto.enabled !== undefined) data.enabled = Boolean(dto.enabled);
    if (dto.sort !== undefined) data.sort = Number(dto.sort);
    await this.prisma.writingStrategy.update({ where: { id }, data });
    return { id };
  }

  async deleteStrategy(id: number) {
    await this.prisma.writingStrategy.delete({ where: { id } });
    return { id };
  }

  // ─── 生成历史 ──────────────────────────────────────────────────────
  async history(query: {
    brandId: number;
    keyword?: string;
    status?: string;
    taskId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.pageSize ?? 20) || 20);
    const where: Prisma.XhsHistoryWhereInput = { brandId: query.brandId };
    if (query.keyword) where.title = { contains: query.keyword };
    if (query.status === 'draft' || query.status === '0') where.status = 0;
    if (query.status === 'published' || query.status === '1') where.status = 1;
    if (query.taskId) where.contentTaskId = Number(query.taskId);
    const [total, rows] = await Promise.all([
      this.prisma.xhsHistory.count({ where }),
      this.prisma.xhsHistory.findMany({
        where,
        orderBy: { uploadTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((h) => ({
        id: h.id,
        title: h.title,
        content: h.content,
        tags: h.tags,
        img_list: h.imgList,
        cover_url: h.coverUrl,
        source: h.source,
        status: h.status,
        content_task_id: h.contentTaskId,
        upload_time: h.uploadTime,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async historyDetail(brandId: number, id: number) {
    const h = await this.prisma.xhsHistory.findUnique({ where: { id } });
    if (!h || h.brandId !== brandId) throw new NotFoundException('记录不存在');
    return {
      id: h.id,
      title: h.title,
      content: h.content,
      tags: h.tags,
      img_list: h.imgList,
      cover_url: h.coverUrl,
      source: h.source,
      status: h.status,
      content_task_id: h.contentTaskId,
      upload_time: h.uploadTime,
    };
  }

  async saveHistory(brandId: number, dto: {
    id?: number | null;
    title: string;
    content: string;
    tags?: string[];
    imgList?: string[];
    coverUrl?: string | null;
    source?: string;
    status?: number;
    contentTaskId?: number | null;
    batchTaskId?: number | null;
  }, userId: number) {
    // 任务归属校验（同品牌）
    let contentTaskId: number | null = null;
    if (dto.contentTaskId) {
      const task = await this.prisma.contentTask.findUnique({
        where: { id: dto.contentTaskId },
      });
      if (task && task.brandId === brandId) contentTaskId = task.id;
    }
    const data = {
      title: dto.title,
      content: dto.content,
      tags: dto.tags ?? [],
      imgList: dto.imgList ?? [],
      coverUrl: dto.coverUrl ?? null,
      source: dto.source ?? 'ai',
      status: dto.status ?? 0,
      contentTaskId,
    };
    // 带 id = 更新（H5 接力发布回写草稿）
    if (dto.id) {
      const existing = await this.prisma.xhsHistory.findUnique({ where: { id: dto.id } });
      if (!existing || existing.brandId !== brandId) throw new NotFoundException('草稿不存在');
      await this.prisma.xhsHistory.update({ where: { id: dto.id }, data });
      return { id: dto.id, status: data.status, content_task_id: contentTaskId };
    }
    return this.prisma.xhsHistory.create({
      data: {
        brandId,
        ...data,
        batchTaskId: dto.batchTaskId ?? null,
        createdById: userId,
      },
    }).then((row) => ({
      id: row.id,
      status: row.status,
      content_task_id: row.contentTaskId,
    }));
  }

  async deleteHistory(id: number) {
    await this.prisma.xhsHistory.delete({ where: { id } });
    return { id };
  }

  // ─── AI 生成 ───────────────────────────────────────────────────────
  generate(input: { brandId: number; productId: number; strategyId?: number | null; extra?: string }) {
    return this.ai.generateArticle(input);
  }

  aiHealth() {
    return this.ai.health();
  }

  randomImages(brandId: number, productId?: string, num?: string) {
    return this.ai.randomImages(brandId, productId ? Number(productId) : undefined, num ? Number(num) : 6);
  }

  /**
   * 批量图文：创建 BatchTask 后台顺序生成，逐条落 XhsHistory 并回写计数
   */
  async batchGenerate(brandId: number, dto: {
    productId: number;
    strategyId?: number | null;
    targetQuantity?: number;
    taskName?: string;
    extra?: string;
    imageMode?: string;
  }, userId: number) {
    const qty = Math.min(20, Math.max(1, dto.targetQuantity ?? 5));
    let product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      product = await this.prisma.product.findFirst({
        where: { brandId, configType: 'product' },
        orderBy: { id: 'asc' },
      });
    }
    if (!product) throw new NotFoundException('该工作区尚无产品，请先在资料库配置产品树');
    const task = await this.prisma.batchTask.create({
      data: {
        taskName: dto.taskName?.trim() || `${product.displayName ?? product.name} × ${qty} 篇`,
        status: 'pending',
        productId: product.id,
        targetQty: qty,
        model: 'random',
        config: { imageMode: dto.imageMode ?? 'auto_match', strategyId: dto.strategyId ?? null, extra: dto.extra ?? '' } as unknown as Prisma.InputJsonValue,
        brandId,
        createdById: userId,
      },
    });
    this.runBatch(task.id, brandId, { ...dto, productId: product.id }, userId).catch(() => undefined);
    return { id: task.id, status: 'pending', target_quantity: qty };
  }

  private async runBatch(taskId: number, brandId: number, dto: {
    productId: number;
    strategyId?: number | null;
    extra?: string;
  }, userId: number) {
    await this.prisma.batchTask.update({ where: { id: taskId }, data: { status: 'running' } });
    const task = await this.prisma.batchTask.findUnique({ where: { id: taskId } });
    const qty = task?.targetQty ?? 1;
    for (let i = 0; i < qty; i++) {
      try {
        const result = await this.ai.generateArticle({
          brandId,
          productId: dto.productId,
          strategyId: dto.strategyId,
          extra: dto.extra,
        });
        const imgs = await this.ai.randomImages(brandId, dto.productId, 4);
        await this.prisma.xhsHistory.create({
          data: {
            brandId,
            title: result.titles[i % result.titles.length] ?? result.titles[0],
            content: result.content,
            tags: result.tags,
            imgList: imgs.map((x) => x.url),
            source: `batch:${result.source}`,
            batchTaskId: taskId,
            createdById: userId,
          },
        });
        await this.prisma.batchTask.update({
          where: { id: taskId },
          data: { successCount: { increment: 1 }, status: i === qty - 1 ? 'completed' : 'running' },
        });
      } catch {
        await this.prisma.batchTask.update({
          where: { id: taskId },
          data: { failedCount: { increment: 1 }, status: 'running' },
        });
      }
    }
    const done = await this.prisma.batchTask.findUnique({ where: { id: taskId } });
    if (done && done.status !== 'cancelled') {
      const status = done.successCount > 0 ? 'completed' : 'failed';
      await this.prisma.batchTask.update({ where: { id: taskId }, data: { status } });
    }
  }

  async batchTasks(brandId: number, query: { page?: string; page_size?: string; status?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.page_size ?? 20) || 20);
    const where: Prisma.BatchTaskWhereInput = { brandId };
    if (query.status) where.status = query.status;
    const [total, rows] = await Promise.all([
      this.prisma.batchTask.count({ where }),
      this.prisma.batchTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: { select: { id: true, displayName: true, name: true } } },
      }),
    ]);
    return {
      list: rows.map((t) => ({
        id: t.id,
        task_name: t.taskName,
        status: t.status,
        product_id: t.productId,
        product_name: t.product?.displayName ?? t.product?.name ?? null,
        target_quantity: t.targetQty,
        success_count: t.successCount,
        failed_count: t.failedCount,
        created_at: t.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  // ─── 内容创作任务（任务分发）───────────────────────────────────────
  /** 任务有效状态：voided > expired(已截止) > active */
  private effectiveStatus(t: { status: string; endTime: Date }) {
    if (t.status === 'voided') return 'voided';
    if (t.endTime.getTime() < Date.now()) return 'expired';
    return 'active';
  }

  async contentTasks(query: {
    brandId: number;
    keyword?: string;
    status?: string;
    hideVoided?: string;
    page?: string;
    page_size?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.page_size ?? 20) || 20);
    const where: Prisma.ContentTaskWhereInput = { brandId: query.brandId };
    if (query.keyword) where.name = { contains: query.keyword };
    if (query.hideVoided !== '0') where.status = { not: 'voided' };
    if (query.status === 'voided') where.status = 'voided';

    const [total, rows] = await Promise.all([
      this.prisma.contentTask.count({ where }),
      this.prisma.contentTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const list = await Promise.all(
      rows.map(async (t) => {
        const progress = await this.taskProgress(t.id, t.startTime, t.endTime);
        return {
          id: t.id,
          name: t.name,
          platform: t.platform,
          scope_type: t.scopeType,
          regions: t.regions,
          account_types: t.accountTypes,
          start_time: t.startTime,
          end_time: t.endTime,
          example_images: t.exampleImages,
          example_link: t.exampleLink,
          instructions: t.instructions,
          reward: t.reward,
          status: t.status,
          effective_status: this.effectiveStatus(t),
          created_at: t.createdAt,
          ...progress,
        };
      }),
    );
    return { list, total, page, page_size: pageSize };
  }

  /** 完成度：参与账号在任务周期内的 KoxNote 发布数（自动统计口径） */
  private async taskProgress(taskId: number, startTime: Date, endTime: Date) {
    const targets = await this.prisma.contentTaskTarget.findMany({
      where: { taskId },
      include: { account: { select: { id: true } } },
    });
    const accountIds = targets.map((x) => x.account.id);
    if (!accountIds.length) {
      return { account_total: 0, account_finished: 0, note_total: 0, completion_rate: 0 };
    }
    const grouped = await this.prisma.koxNote.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        publishTime: { gte: startTime, lte: endTime },
      },
      _count: { _all: true },
    });
    const noteTotal = grouped.reduce((s, g) => s + g._count._all, 0);
    const finished = grouped.length;
    return {
      account_total: accountIds.length,
      account_finished: finished,
      note_total: noteTotal,
      completion_rate: accountIds.length ? Math.round((finished / accountIds.length) * 10000) / 100 : 0,
    };
  }

  async createContentTask(brandId: number, dto: {
    name: string;
    startTime: string;
    endTime: string;
    platform?: string;
    scopeType?: string;
    regions?: string[];
    accountTypes?: string[];
    exampleImages?: string[];
    exampleLink?: string;
    instructions?: string;
    reward?: string;
  }, userId: number) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('任务时间不合法');
    }
    if (end <= start) throw new BadRequestException('结束时间必须晚于开始时间');

    const accountWhere: Prisma.KosAccountWhereInput = { brandId, status: 'enabled' };
    const types = (dto.accountTypes ?? []).filter((x) => x && x !== '不限');
    if (types.length) accountWhere.accountType = { in: types };
    if ((dto.scopeType ?? 'all') === 'regions') {
      const regions = dto.regions ?? [];
      if (!regions.length) throw new BadRequestException('指定大区模式下至少选择一个大区');
      accountWhere.regionName = { in: regions };
    }
    const accounts = await this.prisma.kosAccount.findMany({
      where: accountWhere,
      select: { id: true },
    });

    const task = await this.prisma.contentTask.create({
      data: {
        brandId,
        name: dto.name,
        platform: dto.platform ?? 'xhs',
        scopeType: dto.scopeType ?? 'all',
        regions: dto.regions ?? [],
        accountTypes: dto.accountTypes ?? [],
        startTime: start,
        endTime: end,
        exampleImages: dto.exampleImages ?? [],
        exampleLink: dto.exampleLink ?? null,
        instructions: dto.instructions ?? null,
        reward: dto.reward ?? null,
        createdById: userId,
      },
    });
    if (accounts.length) {
      // 分批插入，避免单条 SQL 参数过多
      for (let i = 0; i < accounts.length; i += 500) {
        await this.prisma.contentTaskTarget.createMany({
          data: accounts.slice(i, i + 500).map((a) => ({ taskId: task.id, accountId: a.id })),
          skipDuplicates: true,
        });
      }
    }
    return { id: task.id, account_total: accounts.length };
  }

  async contentTaskDetail(brandId: number, id: number) {
    const t = await this.prisma.contentTask.findUnique({ where: { id } });
    if (!t || t.brandId !== brandId) throw new NotFoundException('任务不存在');
    const progress = await this.taskProgress(t.id, t.startTime, t.endTime);
    const targets = await this.prisma.contentTaskTarget.findMany({
      where: { taskId: t.id },
      include: {
        account: {
          select: { id: true, nickname: true, accountType: true, regionName: true, storeName: true, authorId: true },
        },
      },
    });
    const ids = targets.map((x) => x.account.id);
    const notes = ids.length
      ? await this.prisma.koxNote.groupBy({
          by: ['accountId'],
          where: { accountId: { in: ids }, publishTime: { gte: t.startTime, lte: t.endTime } },
          _count: { _all: true },
        })
      : [];
    const noteMap = new Map(notes.map((n) => [n.accountId, n._count._all]));
    // H5 扫码接力的产出笔记（挂任务的生成历史）
    const h5Notes = await this.prisma.xhsHistory.findMany({
      where: { contentTaskId: t.id },
      orderBy: { uploadTime: 'desc' },
      take: 50,
      select: { id: true, title: true, coverUrl: true, status: true, uploadTime: true },
    });
    return {
      id: t.id,
      name: t.name,
      platform: t.platform,
      scope_type: t.scopeType,
      regions: t.regions,
      account_types: t.accountTypes,
      start_time: t.startTime,
      end_time: t.endTime,
      example_images: t.exampleImages,
      example_link: t.exampleLink,
      instructions: t.instructions,
      reward: t.reward,
      status: t.status,
      effective_status: this.effectiveStatus(t),
      created_at: t.createdAt,
      creator: t.createdById,
      ...progress,
      h5_note_total: h5Notes.length,
      h5_notes: h5Notes,
      accounts: targets.map((x) => ({
        account_id: x.account.id,
        nickname: x.account.nickname,
        account_type: x.account.accountType,
        region: x.account.regionName,
        store: x.account.storeName,
        note_count: noteMap.get(x.account.id) ?? 0,
        finished: (noteMap.get(x.account.id) ?? 0) > 0,
      })),
    };
  }

  async voidContentTask(brandId: number, id: number) {
    const t = await this.prisma.contentTask.findUnique({ where: { id } });
    if (!t || t.brandId !== brandId) throw new NotFoundException('任务不存在');
    if (t.status === 'voided') throw new BadRequestException('任务已作废');
    await this.prisma.contentTask.update({ where: { id }, data: { status: 'voided' } });
    return { id, status: 'voided' };
  }
}
