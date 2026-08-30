import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InsightService {
  constructor(private prisma: PrismaService) {}

  async overview(query: { start?: string; end?: string; platform?: string }) {
    const end = query.end ? new Date(query.end) : new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    const platform = query.platform || 'all';

    const where: Prisma.InsightDailyStatWhereInput = {
      platform,
      statDate: { gte: start, lte: end },
    };
    const rows = await this.prisma.insightDailyStat.findMany({
      where,
      orderBy: { statDate: 'asc' },
    });
    const sum = (f: (r: (typeof rows)[number]) => number) =>
      rows.reduce((acc, r) => acc + f(r), 0);

    const contentCnt = sum((r) => r.contentCnt);
    const viewSum = sum((r) => r.viewSum);
    const negativeCnt = sum((r) => r.negativeCnt);

    return {
      content_cnt: contentCnt,
      mention_cnt: sum((r) => r.mentionCnt),
      view_sum: viewSum,
      interaction_sum: sum((r) => r.likeSum + r.commentSum + r.shareSum),
      negative_cnt: negativeCnt,
      negative_rate: contentCnt
        ? Math.round((negativeCnt / contentCnt) * 1000) / 10
        : 0,
      trend: rows.map((r) => ({
        date: r.statDate.toISOString().slice(0, 10),
        content_cnt: r.contentCnt,
        view_sum: r.viewSum,
        interaction_sum: r.likeSum + r.commentSum + r.shareSum,
        negative_cnt: r.negativeCnt,
      })),
    };
  }

  async contents(query: {
    page?: string;
    page_size?: string;
    platform?: string;
    sentiment?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.page_size ?? 15) || 15);
    const where: Prisma.InsightContentWhereInput = { irrelevant: false };
    if (query.platform) where.platform = query.platform;
    if (query.sentiment) where.sentiment = query.sentiment;
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { authorName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.insightContent.count({ where }),
      this.prisma.insightContent.findMany({
        where,
        orderBy: { publishAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((c) => ({
        id: c.id,
        platform: c.platform,
        content_type: c.contentType,
        title: c.title,
        author_name: c.authorName,
        author_type: c.authorType,
        publish_at: c.publishAt,
        views: c.views,
        likes: c.likes,
        comments: c.comments,
        shares: c.shares,
        collects: c.collects,
        sentiment: c.sentiment,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async markIrrelevant(id: number) {
    const content = await this.prisma.insightContent.findUnique({
      where: { id },
    });
    if (!content) throw new NotFoundException('内容不存在');
    await this.prisma.insightContent.update({
      where: { id },
      data: { irrelevant: true },
    });
    return { id };
  }

  async reports() {
    const rows = await this.prisma.insightReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      list: rows.map((r) => ({
        id: r.id,
        name: r.name,
        period: r.period,
        access: r.access,
        file_size: r.fileSize,
        created_at: r.createdAt,
      })),
      total: rows.length,
    };
  }

  async createReport(
    dto: { name: string; period?: string; access?: string },
    userId: number,
  ) {
    const report = await this.prisma.insightReport.create({
      data: {
        name: dto.name,
        period: dto.period ?? new Date().toISOString().slice(0, 7),
        access: dto.access ?? 'public',
        fileSize: 1024 * (200 + Math.floor(Math.random() * 3000)),
        createdById: userId,
      },
    });
    return { id: report.id };
  }

  async deleteReport(id: number) {
    await this.prisma.insightReport.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('报告不存在');
    });
    return { id };
  }
}
