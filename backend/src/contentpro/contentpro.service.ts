import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { QuotaService } from './quota.service';

@Injectable()
export class ContentproService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private quota: QuotaService,
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
    batchTaskId?: string;
    batchOnly?: string;
    unpackaged?: string;
    packaged?: string;
    reviewStatus?: string;
    packageId?: string;
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
    if (query.batchTaskId) where.batchTaskId = Number(query.batchTaskId);
    if (query.batchOnly === '1') where.batchTaskId = { not: null };
    if (query.reviewStatus) {
      const statuses = query.reviewStatus.split(',').map((s) => s.trim()).filter(Boolean);
      where.reviewStatus = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (query.packageId) where.packageId = Number(query.packageId);
    if (query.unpackaged === '1') where.packageId = null;
    if (query.packaged === '1') where.packageId = { not: null };
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
      list: rows.map((h) => this.mapHistory(h)),
      total,
      page,
      page_size: pageSize,
    };
  }

  /** XhsHistory → 前端契约（含内容包审核/领用字段） */
  private mapHistory(
    h: {
      id: number;
      title: string;
      content: string;
      tags: string[];
      imgList: string[];
      coverUrl: string | null;
      source: string;
      status: number;
      contentTaskId: number | null;
      batchTaskId: number | null;
      contentForm: string;
      strategyId: number | null;
      directionName: string | null;
      packageId: number | null;
      reviewStatus: string;
      rejectReason: string | null;
      claimedById: number | null;
      claimedAt: Date | null;
      dispatchedToId: number | null;
      dispatchedAt: Date | null;
      uploadTime: Date;
    },
    packageName?: string | null,
  ) {
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
      batch_task_id: h.batchTaskId,
      content_form: h.contentForm,
      strategy_id: h.strategyId,
      direction_name: h.directionName,
      package_id: h.packageId,
      package_name: packageName ?? null,
      review_status: h.reviewStatus,
      reject_reason: h.rejectReason,
      claimed_by_id: h.claimedById,
      claimed_at: h.claimedAt,
      dispatched_to_id: h.dispatchedToId,
      dispatched_at: h.dispatchedAt,
      upload_time: h.uploadTime,
    };
  }

  async historyDetail(brandId: number, id: number) {
    const h = await this.prisma.xhsHistory.findUnique({ where: { id } });
    if (!h || h.brandId !== brandId) throw new NotFoundException('记录不存在');
    return this.mapHistory(h);
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
  async generate(input: { brandId: number; productId: number; strategyId?: number | null; extra?: string; directionName?: string | null; wordCount?: string | null }, userId?: number) {
    await this.quota.assertEnough(input.brandId, 1);
    await this.quota.consume(input.brandId, 1, userId, '单篇生成');
    try {
      const result = await this.ai.generateArticle(input);
      return result;
    } catch (e) {
      await this.quota.refund(input.brandId, 1, userId, '单篇生成失败退回');
      throw e;
    }
  }

  aiHealth() {
    return this.ai.health();
  }

  // ─── 算力配额 ──────────────────────────────────────────────────────
  quotaSummary(brandId: number) {
    return this.quota.summary(brandId);
  }

  async quotaGrant(brandId: number, amount: number, operator: { id: number; role: string }, remark?: string) {
    if (operator.role !== 'ADMIN') throw new ForbiddenException('仅超级管理员可调整算力');
    return this.quota.grant(brandId, amount, operator.id, remark);
  }

  async coverEditStatus(brandId: number, userId: number) {
    return this.quota.coverEditStatus(brandId, userId);
  }

  async coverEditUse(brandId: number, userId: number) {
    return this.quota.coverEditConsume(brandId, userId);
  }

  // ─── 创客贴（CHUANGKIT_APP_KEY 配置后启用）──────────────────────────
  chuangkitConfig() {
    return {
      enabled: Boolean(process.env.CHUANGKIT_APP_KEY),
      editor_url: process.env.CHUANGKIT_EDITOR_URL ?? '',
    };
  }

  /** 创客贴导出图转存本地（外链有时效，落库转 /uploads） */
  async chuangkitImport(brandId: number, dto: { url: string }) {
    if (!/^https?:\/\//.test(dto.url)) throw new BadRequestException('URL 不合法');
    const res = await fetch(dto.url);
    if (!res.ok) throw new BadRequestException(`下载失败 http ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new BadRequestException('下载内容为空');
    const path = await import('path');
    const fs = await import('fs');
    const root = process.env.UPLOAD_ROOT
      ? process.env.UPLOAD_ROOT
      : path.resolve(__dirname, '..', '..', 'uploads');
    const dir = path.join(root, 'materials', String(brandId));
    fs.mkdirSync(dir, { recursive: true });
    const filename = `chuangkit_${randomUUID()}.png`;
    fs.writeFileSync(path.join(dir, filename), buf);
    return { url: `/uploads/materials/${brandId}/${filename}` };
  }

  randomImages(brandId: number, productId?: string, num?: string) {
    return this.ai.randomImages(brandId, productId ? Number(productId) : undefined, num ? Number(num) : 6);
  }

  /**
   * 批量图文：创建 BatchTask 后台顺序生成，逐条落 XhsHistory 并回写计数。
   * 支持策略矩阵 items[]（策略×内容方向×数量×字数×配图方式），兼容旧单策略入参。
   * 算力：每篇 1 算力，创建前预检、逐篇扣减、失败退回。
   */
  async batchGenerate(brandId: number, dto: {
    productId: number;
    strategyId?: number | null;
    targetQuantity?: number;
    taskName?: string;
    extra?: string;
    imageMode?: string;
    items?: { strategyId?: number | null; directionName?: string | null; count: number; wordCount?: string | null }[];
  }, userId: number) {
    let product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      product = await this.prisma.product.findFirst({
        where: { brandId, configType: 'product' },
        orderBy: { id: 'asc' },
      });
    }
    if (!product) throw new NotFoundException('该工作区尚无产品，请先在资料库配置产品树');

    // 归一化生成计划：items 优先，回退旧单策略×数量
    const items = (dto.items?.length ? dto.items : [{
      strategyId: dto.strategyId ?? null,
      directionName: null,
      count: Math.min(20, Math.max(1, dto.targetQuantity ?? 5)),
      wordCount: null,
    }])
      .map((it) => ({ ...it, count: Math.min(20, Math.max(1, Number(it.count) || 1)) }))
      .filter((it) => it.strategyId || it.directionName || true);
    const totalQty = Math.min(50, items.reduce((s, it) => s + it.count, 0));

    // 校验策略归属品牌 + 组装任务名称
    const strategyIds = [...new Set(items.map((it) => it.strategyId).filter((x): x is number => !!x))];
    if (strategyIds.length) {
      const found = await this.prisma.writingStrategy.count({ where: { id: { in: strategyIds }, brandId } });
      if (found < strategyIds.length) throw new BadRequestException('包含其他工作区的创作策略');
    }
    const strategyNameMap = new Map(
      (strategyIds.length
        ? await this.prisma.writingStrategy.findMany({ where: { id: { in: strategyIds } }, select: { id: true, name: true } })
        : []
      ).map((s) => [s.id, s.name]),
    );

    // 算力预检
    await this.quota.assertEnough(brandId, totalQty);

    const task = await this.prisma.batchTask.create({
      data: {
        taskName:
          dto.taskName?.trim() ||
          (items.length === 1 && items[0].strategyId
            ? `${strategyNameMap.get(items[0].strategyId!)} × ${items[0].count} 篇`
            : `${product.displayName ?? product.name} × ${totalQty} 篇`),
        status: 'pending',
        productId: product.id,
        targetQty: totalQty,
        model: 'random',
        config: {
          imageMode: dto.imageMode ?? 'auto_match',
          extra: dto.extra ?? '',
          items: items.map((it) => ({
            strategy_id: it.strategyId ?? null,
            strategy_name: it.strategyId ? (strategyNameMap.get(it.strategyId) ?? null) : null,
            direction_name: it.directionName ?? null,
            count: it.count,
            word_count: it.wordCount ?? null,
          })),
        } as unknown as Prisma.InputJsonValue,
        brandId,
        pointsTotal: totalQty,
        createdById: userId,
      },
    });
    this.runBatch(task.id, brandId, { ...dto, productId: product.id, items }, userId).catch(() => undefined);
    return { id: task.id, status: 'pending', target_quantity: totalQty, points_total: totalQty };
  }

  private async runBatch(taskId: number, brandId: number, dto: {
    productId: number;
    strategyId?: number | null;
    extra?: string;
    items?: { strategyId?: number | null; directionName?: string | null; count: number; wordCount?: string | null }[];
  }, userId: number) {
    await this.prisma.batchTask.update({ where: { id: taskId }, data: { status: 'running' } });
    const task = await this.prisma.batchTask.findUnique({ where: { id: taskId } });
    const items = dto.items?.length
      ? dto.items
      : [{ strategyId: dto.strategyId ?? null, directionName: null, count: task?.targetQty ?? 1, wordCount: null }];
    let done = 0;
    for (const item of items) {
      for (let i = 0; i < item.count; i++) {
        try {
          const result = await this.ai.generateArticle({
            brandId,
            productId: dto.productId,
            strategyId: item.strategyId,
            directionName: item.directionName ?? undefined,
            wordCount: item.wordCount ?? undefined,
            extra: dto.extra,
          });
          const imgs = await this.ai.randomImages(brandId, dto.productId, 4);
          await this.quota.consume(brandId, 1, userId, `批量生成 #${taskId}`);
          await this.prisma.xhsHistory.create({
            data: {
              brandId,
              title: result.titles[i % result.titles.length] ?? result.titles[0],
              content: result.content,
              tags: result.tags,
              imgList: imgs.map((x) => x.url),
              source: `batch:${result.source}`,
              batchTaskId: taskId,
              strategyId: item.strategyId ?? null,
              directionName: item.directionName ?? null,
              reviewStatus: 'draft',
              createdById: userId,
            },
          });
          done += 1;
          await this.prisma.batchTask.update({
            where: { id: taskId },
            data: { successCount: { increment: 1 }, status: done >= (task?.targetQty ?? 1) ? 'completed' : 'running' },
          });
        } catch {
          // 生成失败：算力退回
          await this.quota.refund(brandId, 1, userId, `批量生成失败退回 #${taskId}`);
          await this.prisma.batchTask.update({
            where: { id: taskId },
            data: {
              failedCount: { increment: 1 },
              pointsRefunded: { increment: 1 },
              status: 'running',
            },
          });
        }
      }
    }
    const finished = await this.prisma.batchTask.findUnique({ where: { id: taskId } });
    if (finished && finished.status !== 'cancelled') {
      const status = finished.successCount > 0 ? 'completed' : 'failed';
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
        points_total: t.pointsTotal,
        points_refunded: t.pointsRefunded,
        created_at: t.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  // ─── 内容包 Pro（生成 → 审核 → 领用/分发 闭环）──────────────────────

  /** 包内六态统计（对齐旧系统 stats：total/draft/pending/approved/rejected/used） */
  private async packageStats(packageId: number) {
    const grouped = await this.prisma.xhsHistory.groupBy({
      by: ['reviewStatus'],
      where: { packageId, reviewStatus: { not: 'discarded' } },
      _count: { _all: true },
    });
    const get = (k: string) => grouped.find((g) => g.reviewStatus === k)?._count._all ?? 0;
    const draft = get('draft') + get('rejected');
    const pending = get('pending');
    const approved = get('approved');
    const used = await this.prisma.packageClaim.count({ where: { packageId } });
    return {
      total: draft + pending + approved,
      draft,
      pending,
      approved,
      rejected: get('rejected'),
      used,
    };
  }

  /** 产品名映射（FactoryPackage.productId 无关联，统一批量查） */
  private async productNameMap(brandId: number, productIds: (number | null)[]) {
    const ids = [...new Set(productIds.filter((x): x is number => !!x))];
    if (!ids.length) return new Map<number, string>();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, brandId },
      select: { id: true, displayName: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.displayName ?? r.name]));
  }

  async packagesList(brandId: number, query: { scope?: string; keyword?: string; userId?: number }) {
    const where: Prisma.FactoryPackageWhereInput = { brandId, deletedAt: null };
    if (query.scope === 'mine' && query.userId) where.createdById = query.userId;
    if (query.keyword) where.name = { contains: query.keyword };
    const rows = await this.prisma.factoryPackage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const pNames = await this.productNameMap(brandId, rows.map((p) => p.productId));
    const list = await Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        uid: p.uid,
        name: p.name,
        description: p.description,
        product_id: p.productId,
        product_name: p.productId ? (pNames.get(p.productId) ?? null) : null,
        open_flag: p.openFlag,
        claim_once: p.claimOnce,
        review_mode: p.reviewMode,
        creator_user_id: p.createdById,
        created_at: p.createdAt,
        stats: await this.packageStats(p.id),
      })),
    );
    return { list, total: list.length };
  }

  async createPackage(brandId: number, dto: {
    name: string;
    description?: string;
    productId?: number | null;
    openFlag?: boolean;
    claimOnce?: boolean;
    reviewMode?: number;
  }, userId: number) {
    const p = await this.prisma.factoryPackage.create({
      data: {
        brandId,
        uid: randomUUID(),
        name: dto.name.trim(),
        description: dto.description ?? null,
        productId: dto.productId ?? null,
        openFlag: dto.openFlag ?? true,
        claimOnce: dto.claimOnce ?? true,
        reviewMode: dto.reviewMode ?? 1,
        createdById: userId,
      },
    });
    return { id: p.id, uid: p.uid };
  }

  async updatePackage(brandId: number, id: number, dto: {
    name?: string;
    description?: string | null;
    openFlag?: boolean;
    claimOnce?: boolean;
    reviewMode?: number;
    productId?: number | null;
  }) {
    const p = await this.prisma.factoryPackage.findFirst({ where: { id, brandId, deletedAt: null } });
    if (!p) throw new NotFoundException('内容包不存在');
    await this.prisma.factoryPackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.openFlag !== undefined ? { openFlag: dto.openFlag } : {}),
        ...(dto.claimOnce !== undefined ? { claimOnce: dto.claimOnce } : {}),
        ...(dto.reviewMode !== undefined ? { reviewMode: dto.reviewMode } : {}),
        ...(dto.productId !== undefined ? { productId: dto.productId } : {}),
      },
    });
    return { id };
  }

  async deletePackage(brandId: number, id: number) {
    const p = await this.prisma.factoryPackage.findFirst({ where: { id, brandId, deletedAt: null } });
    if (!p) throw new NotFoundException('内容包不存在');
    // 包内仍有内容时禁止删除
    const cnt = await this.prisma.xhsHistory.count({ where: { packageId: id, reviewStatus: { not: 'discarded' } } });
    if (cnt > 0) throw new BadRequestException(`包内还有 ${cnt} 条内容，请先移出或废弃`);
    await this.prisma.factoryPackage.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  /** 包详情：素材列表（状态页签筛选 + 指派/领用信息） */
  async packageDetail(brandId: number, id: number, query: { tab?: string; keyword?: string; page?: string; pageSize?: string }) {
    const p = await this.prisma.factoryPackage.findFirst({ where: { id, brandId, deletedAt: null } });
    if (!p) throw new NotFoundException('内容包不存在');
    const pNames = await this.productNameMap(brandId, [p.productId]);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.pageSize ?? 20) || 20);
    const where: Prisma.XhsHistoryWhereInput = { packageId: id, reviewStatus: { not: 'discarded' } };
    if (query.tab === 'draft') where.reviewStatus = { in: ['draft', 'rejected'] };
    if (query.tab === 'pending') where.reviewStatus = 'pending';
    if (query.tab === 'approved') where.reviewStatus = 'approved';
    if (query.tab === 'rejected') where.reviewStatus = 'rejected';
    if (query.keyword) where.title = { contains: query.keyword };
    const [total, rows] = await Promise.all([
      this.prisma.xhsHistory.count({ where }),
      this.prisma.xhsHistory.findMany({ where, orderBy: { uploadTime: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const userIds = [
      ...rows.map((r) => r.claimedById).filter((x): x is number => !!x),
      ...rows.map((r) => r.dispatchedToId).filter((x): x is number => !!x),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, nickname: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.nickname]));
    return {
      id: p.id,
      uid: p.uid,
      name: p.name,
      description: p.description,
      product_id: p.productId,
      product_name: p.productId ? (pNames.get(p.productId) ?? null) : null,
      open_flag: p.openFlag,
      claim_once: p.claimOnce,
      review_mode: p.reviewMode,
      creator_user_id: p.createdById,
      created_at: p.createdAt,
      stats: await this.packageStats(p.id),
      items: rows.map((h) => ({
        ...this.mapHistory(h),
        claimed_by_name: h.claimedById ? (userMap.get(h.claimedById) ?? null) : null,
        dispatched_to_name: h.dispatchedToId ? (userMap.get(h.dispatchedToId) ?? null) : null,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  /** 批量移入内容包（待处理 → 包内草稿；已废弃不可移） */
  async moveToPackage(brandId: number, packageId: number, historyIds: number[]) {
    if (!historyIds.length) throw new BadRequestException('请选择要移动的内容');
    const pkg = await this.prisma.factoryPackage.findFirst({ where: { id: packageId, brandId, deletedAt: null } });
    if (!pkg) throw new NotFoundException('内容包不存在');
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const movable = rows.filter((r) => r.reviewStatus !== 'discarded');
    if (!movable.length) throw new BadRequestException('所选内容均已废弃，不可移动');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: movable.map((r) => r.id) } },
      data: { packageId, reviewStatus: 'draft', rejectReason: null },
    });
    return { moved: movable.length };
  }

  /** 从内容包移出（回到待处理） */
  async moveOutOfPackage(brandId: number, historyIds: number[]) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const movable = rows.filter((r) => r.packageId && ['draft', 'rejected'].includes(r.reviewStatus));
    if (!movable.length) throw new BadRequestException('仅包内草稿/被驳回内容可移出');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: movable.map((r) => r.id) } },
      data: { packageId: null, rejectReason: null },
    });
    return { moved: movable.length };
  }

  /** 批量废弃（待处理/包内草稿可废弃；已进入审核或被领用的不可废弃） */
  async discardHistories(brandId: number, historyIds: number[]) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const ok = rows.filter((r) => ['draft'].includes(r.reviewStatus));
    if (!ok.length) throw new BadRequestException('仅草稿/待处理内容可废弃');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: ok.map((r) => r.id) } },
      data: { reviewStatus: 'discarded' },
    });
    return { discarded: ok.length };
  }

  /** 轻量编辑（批量结果/包内编辑：只更新内容字段，不动状态与任务归属） */
  async updateHistoryContent(brandId: number, id: number, dto: {
    title?: string;
    content?: string;
    tags?: string[];
    imgList?: string[];
    coverUrl?: string | null;
  }) {
    const h = await this.prisma.xhsHistory.findFirst({ where: { id, brandId } });
    if (!h) throw new NotFoundException('内容不存在');
    if (!['draft', 'rejected'].includes(h.reviewStatus)) {
      throw new BadRequestException('当前状态不可编辑');
    }
    await this.prisma.xhsHistory.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.imgList !== undefined ? { imgList: dto.imgList } : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl } : {}),
      },
    });
    return { id };
  }

  /** 提交审核：包内草稿/被驳回 → 待审核 */
  async submitAudit(brandId: number, historyIds: number[]) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const ok = rows.filter((r) => r.packageId && ['draft', 'rejected'].includes(r.reviewStatus));
    if (!ok.length) throw new BadRequestException('仅包内草稿/被驳回内容可提交审核');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: ok.map((r) => r.id) } },
      data: { reviewStatus: 'pending', rejectReason: null },
    });
    return { submitted: ok.length };
  }

  /** 审核通过：待审核 → 过审待领用 */
  async approveHistory(brandId: number, historyIds: number[]) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const ok = rows.filter((r) => r.reviewStatus === 'pending');
    if (!ok.length) throw new BadRequestException('仅待审核内容可通过');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: ok.map((r) => r.id) } },
      data: { reviewStatus: 'approved', rejectReason: null },
    });
    return { approved: ok.length };
  }

  /** 审核驳回：待审核 → 被驳回（可改后重新提交） */
  async rejectHistory(brandId: number, historyIds: number[], reason?: string) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const ok = rows.filter((r) => r.reviewStatus === 'pending');
    if (!ok.length) throw new BadRequestException('仅待审核内容可驳回');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: ok.map((r) => r.id) } },
      data: { reviewStatus: 'rejected', rejectReason: reason ?? '不符合要求' },
    });
    return { rejected: ok.length };
  }

  /** 跨包待审核列表（内容审核页） */
  async auditList(brandId: number, query: { packageId?: string; keyword?: string; page?: string; pageSize?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.pageSize ?? 20) || 20);
    const where: Prisma.XhsHistoryWhereInput = { brandId, reviewStatus: 'pending', packageId: { not: null } };
    if (query.packageId) where.packageId = Number(query.packageId);
    if (query.keyword) where.title = { contains: query.keyword };
    const [total, rows] = await Promise.all([
      this.prisma.xhsHistory.count({ where }),
      this.prisma.xhsHistory.findMany({
        where,
        orderBy: { uploadTime: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { package: { select: { name: true } } },
      }),
    ]);
    return {
      list: rows.map((h) => this.mapHistory(h, h.package?.name ?? null)),
      total,
      page,
      page_size: pageSize,
    };
  }

  /** 分发：把过审内容指派给指定 KOS 用户（H5 可见） */
  async dispatchHistory(brandId: number, historyIds: number[], targetUserId: number) {
    const rows = await this.prisma.xhsHistory.findMany({ where: { id: { in: historyIds }, brandId } });
    const ok = rows.filter((r) => r.reviewStatus === 'approved' && r.packageId);
    if (!ok.length) throw new BadRequestException('仅「过审待领用」的内容可分发');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('目标用户不存在');
    await this.prisma.xhsHistory.updateMany({
      where: { id: { in: ok.map((r) => r.id) } },
      data: { dispatchedToId: targetUserId, dispatchedAt: new Date() },
    });
    return { dispatched: ok.length, to: target.nickname };
  }

  /** 领用：从开放包领一条过审内容（每人限领一次的包做幂等校验；分发给自己的优先） */
  async claimFromPackage(brandId: number, userId: number, packageId: number, source = 'h5') {
    const pkg = await this.prisma.factoryPackage.findFirst({ where: { id: packageId, brandId, deletedAt: null } });
    if (!pkg) throw new NotFoundException('内容包不存在');
    if (!pkg.openFlag) throw new BadRequestException('该内容包未开放领用');
    if (pkg.claimOnce) {
      const claimed = await this.prisma.packageClaim.findFirst({ where: { packageId, userId } });
      if (claimed) throw new BadRequestException('你已领用过该内容包的内容');
    }
    // 分发给自己的优先，否则取最早过审的未领用内容
    const candidate =
      (await this.prisma.xhsHistory.findFirst({
        where: { packageId, reviewStatus: 'approved', claimedById: null, dispatchedToId: userId },
        orderBy: { dispatchedAt: 'asc' },
      })) ??
      (await this.prisma.xhsHistory.findFirst({
        where: { packageId, reviewStatus: 'approved', claimedById: null },
        orderBy: { uploadTime: 'asc' },
      }));
    if (!candidate) throw new BadRequestException('包内暂无可领用内容');
    await this.prisma.xhsHistory.update({
      where: { id: candidate.id },
      data: { claimedById: userId, claimedAt: new Date() },
    });
    await this.prisma.packageClaim.create({
      data: { packageId, historyId: candidate.id, userId, source },
    });
    return { history_id: candidate.id, package_id: packageId };
  }

  /** 我的领用 + 分发给我未领用的内容（H5 领用中心） */
  async myClaims(brandId: number, userId: number) {
    const claims = await this.prisma.packageClaim.findMany({
      where: { userId, package: { brandId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        history: true,
        package: { select: { id: true, name: true } },
      },
    });
    const dispatched = await this.prisma.xhsHistory.findMany({
      where: { brandId, dispatchedToId: userId, claimedById: null, reviewStatus: 'approved', packageId: { not: null } },
      include: { package: { select: { id: true, name: true } } },
      orderBy: { dispatchedAt: 'desc' },
    });
    return {
      claims: claims
        .filter((c) => c.history)
        .map((c) => ({
          ...this.mapHistory(c.history!, c.package.name),
          claim_id: c.id,
          claimed_source: c.source,
          claim_time: c.createdAt,
          package_id: c.package.id,
          package_name: c.package.name,
        })),
      dispatched: dispatched.map((h) => this.mapHistory(h, h.package?.name ?? null)),
    };
  }

  /** 可领用包列表（H5：开放中 + 有可领内容） */
  async mobilePackages(brandId: number, userId: number) {
    const pkgs = await this.prisma.factoryPackage.findMany({
      where: { brandId, deletedAt: null, openFlag: true },
      orderBy: { createdAt: 'desc' },
    });
    const myClaimsByPkg = new Map<number, number>();
    const myClaims = await this.prisma.packageClaim.groupBy({
      by: ['packageId'],
      where: { userId, package: { brandId } },
      _count: { _all: true },
    });
    myClaims.forEach((c) => myClaimsByPkg.set(c.packageId, c._count._all));
    const list = [];
    for (const p of pkgs) {
      const [claimable, mine] = await Promise.all([
        this.prisma.xhsHistory.count({ where: { packageId: p.id, reviewStatus: 'approved', claimedById: null } }),
        this.prisma.xhsHistory.count({
          where: { packageId: p.id, reviewStatus: 'approved', claimedById: null, dispatchedToId: userId },
        }),
      ]);
      if (!claimable) continue;
      list.push({
        id: p.id,
        uid: p.uid,
        name: p.name,
        description: p.description,
        claimable,
        dispatched_to_me: mine,
        my_claimed: myClaimsByPkg.get(p.id) ?? 0,
        claim_once: p.claimOnce,
        created_at: p.createdAt,
      });
    }
    return { list, total: list.length };
  }

  /** 领用记录流水（领用记录页） */
  async claimLog(brandId: number, query: { packageId?: string; page?: string; pageSize?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.pageSize ?? 20) || 20);
    const where: Prisma.PackageClaimWhereInput = { package: { brandId, deletedAt: null } };
    if (query.packageId) where.packageId = Number(query.packageId);
    const [total, rows] = await Promise.all([
      this.prisma.packageClaim.count({ where }),
      this.prisma.packageClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          history: { select: { id: true, title: true, status: true, coverUrl: true } },
          package: { select: { id: true, name: true } },
        },
      }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.nickname]));
    return {
      list: rows.map((c) => ({
        id: c.id,
        package_id: c.package.id,
        package_name: c.package.name,
        history_id: c.history?.id ?? null,
        title: c.history?.title ?? '(已删除)',
        cover_url: c.history?.coverUrl ?? null,
        published: (c.history?.status ?? 0) === 1,
        user_id: c.userId,
        user_name: userMap.get(c.userId) ?? `用户${c.userId}`,
        source: c.source,
        claimed_at: c.createdAt,
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
