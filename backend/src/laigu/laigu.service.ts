import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LaiguApiClient, LaiguSession } from './laigu-api.client';

const MAX_PAGES_PER_SYNC = 100;
const SYNC_OVERLAP_SECONDS = 3600;
const MAX_WINDOW_SECONDS = 29 * 24 * 3600;
const LAIGU_BRAND_ID = 5;

@Injectable()
export class LaiguService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LaiguService.name);
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: LaiguApiClient,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const minutes = Number(this.configService.get<string>('LAIGU_SYNC_INTERVAL_MINUTES') ?? 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('来鼓定时同步已禁用（LAIGU_SYNC_INTERVAL_MINUTES<=0）');
      return;
    }
    setTimeout(() => {
      this.safeSync().catch(() => undefined);
    }, 5_000).unref();
    this.syncTimer = setInterval(() => {
      this.safeSync().catch(() => undefined);
    }, minutes * 60_000);
    this.syncTimer.unref();
    this.logger.log(`来鼓定时同步已启动：每 ${minutes} 分钟`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  private async safeSync() {
    try {
      const result = await this.syncLeads();
      this.logger.log(`来鼓增量同步完成：拉取 ${result.fetched} 条`);
    } catch (error) {
      this.logger.warn(`来鼓定时同步失败: ${(error as Error).message}`);
    }
  }

  /** 从来鼓拉取会话并幂等入库；fromTm/toTm 缺省为「上次最新时间-重叠 → 现在」 */
  async syncLeads(opts?: { fromTm?: number; toTm?: number }) {
    if (this.syncing) throw new Error('同步进行中，请稍后再试');
    this.syncing = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const toTm = opts?.toTm ?? now;
      let fromTm = opts?.fromTm;
      if (!fromTm) {
        const latest = await this.prisma.laiguLead.findFirst({
          where: { brandId: LAIGU_BRAND_ID, lastMessageAt: { not: null } },
          orderBy: { lastMessageAt: 'desc' },
          select: { lastMessageAt: true },
        });
        const latestTs = latest?.lastMessageAt
          ? Math.floor(latest.lastMessageAt.getTime() / 1000)
          : 0;
        fromTm = Math.max(latestTs - SYNC_OVERLAP_SECONDS, toTm - MAX_WINDOW_SECONDS);
      }
      let fetched = 0;
      let pages = 0;
      let total = 0;
      for (let page = 1; page <= MAX_PAGES_PER_SYNC; page++) {
        const data = await this.api.chatMessages({
          from_tm: fromTm,
          to_tm: toTm,
          page,
          page_size: 100,
        });
        pages++;
        total = data.total ?? 0;
        for (const session of data.sessions ?? []) {
          await this.upsertSession(session);
        }
        fetched += (data.sessions ?? []).length;
        if (!data.sessions?.length || fetched >= total) break;
      }
      return { fetched, pages, total, from_tm: fromTm, to_tm: toTm };
    } finally {
      this.syncing = false;
    }
  }

  private extractPhone(session: LaiguSession): string | null {
    const tel = (session.client_attrs as { tel?: unknown } | undefined)?.tel;
    if (Array.isArray(tel) && tel.length && typeof tel[0] === 'string') return tel[0];
    if (typeof tel === 'string' && tel) return tel;
    return null;
  }

  private upsertSession(session: LaiguSession) {
    const messages = session.messages ?? [];
    const times = messages.map((m) => m.created_at).filter((t): t is number => typeof t === 'number');
    const clientMessages = messages.filter((m) => m.role === 'client');
    const lastClientText = [...clientMessages]
      .reverse()
      .find((m) => (m.type === 'text' || !m.type) && m.content)?.content;
    const data: Prisma.LaiguLeadUncheckedCreateInput = {
      brandId: LAIGU_BRAND_ID,
      sessionId: String(session.session_id),
      clientId: session.client_id ?? null,
      clientName: session.client_name ?? null,
      phone: this.extractPhone(session),
      isResource: Boolean(session.is_resource),
      source: session.source ?? null,
      subSource: session.sub_source ?? null,
      chatEntry: session.chat_entry ?? null,
      ipLocation: session.ip_location ?? null,
      clientAttrs: (session.client_attrs ?? undefined) as Prisma.InputJsonValue | undefined,
      adInfo: (session.ad_info ?? undefined) as Prisma.InputJsonValue | undefined,
      messageCount: messages.length,
      clientMessageCount: clientMessages.length,
      firstMessageAt: times.length ? new Date(Math.min(...times) * 1000) : null,
      lastMessageAt: times.length ? new Date(Math.max(...times) * 1000) : null,
      lastClientContent: lastClientText ? lastClientText.slice(0, 500) : null,
      sessionCreatedAt: session.created_at ? new Date(session.created_at * 1000) : null,
      sessionEndedAt: session.ended_at ? new Date(session.ended_at * 1000) : null,
      rawJson: session as unknown as Prisma.InputJsonValue,
    };
    return this.prisma.laiguLead.upsert({
      where: { sessionId: data.sessionId },
      create: data,
      update: {
        clientName: data.clientName,
        phone: data.phone ?? undefined,
        isResource: data.isResource,
        clientAttrs: data.clientAttrs,
        adInfo: data.adInfo,
        messageCount: data.messageCount,
        clientMessageCount: data.clientMessageCount,
        firstMessageAt: data.firstMessageAt,
        lastMessageAt: data.lastMessageAt,
        lastClientContent: data.lastClientContent,
        sessionCreatedAt: data.sessionCreatedAt,
        sessionEndedAt: data.sessionEndedAt,
        rawJson: data.rawJson,
      },
    });
  }

  async leads(query: {
    page?: string;
    page_size?: string;
    keyword?: string;
    isResource?: string;
    hasPhone?: string;
    source?: string;
    from?: string;
    to?: string;
    brandId?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 10) || 10);
    const brandId = Number(query.brandId ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const where: Prisma.LaiguLeadWhereInput = { brandId };
    if (query.isResource === 'true') where.isResource = true;
    if (query.isResource === 'false') where.isResource = false;
    if (query.hasPhone === 'true') where.phone = { not: null };
    if (query.hasPhone === 'false') where.phone = null;
    if (query.source) where.source = query.source;
    if (query.from || query.to) {
      const activeAt: Prisma.DateTimeNullableFilter = {};
      if (query.from) activeAt.gte = new Date(`${query.from}T00:00:00`);
      if (query.to) activeAt.lte = new Date(`${query.to}T23:59:59`);
      where.lastMessageAt = activeAt;
    }
    if (query.keyword) {
      where.OR = [
        { clientName: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword } },
        { lastClientContent: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.laiguLead.count({ where }),
      this.prisma.laiguLead.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sessionId: true,
          clientName: true,
          phone: true,
          isResource: true,
          source: true,
          subSource: true,
          adInfo: true,
          messageCount: true,
          clientMessageCount: true,
          firstMessageAt: true,
          lastMessageAt: true,
          lastClientContent: true,
          sessionCreatedAt: true,
          sessionEndedAt: true,
          fetchedAt: true,
        },
      }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        session_id: row.sessionId,
        client_name: row.clientName,
        phone: row.phone,
        is_resource: row.isResource,
        source: row.source,
        sub_source: row.subSource,
        ad_info: row.adInfo,
        message_count: row.messageCount,
        client_message_count: row.clientMessageCount,
        first_message_at: row.firstMessageAt,
        last_message_at: row.lastMessageAt,
        last_client_content: row.lastClientContent,
        session_created_at: row.sessionCreatedAt,
        session_ended_at: row.sessionEndedAt,
        fetched_at: row.fetchedAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async stats(brandIdParam?: string) {
    const brandId = Number(brandIdParam ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const scope = { brandId };
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [total, resourced, withPhone, today] = await Promise.all([
      this.prisma.laiguLead.count({ where: scope }),
      this.prisma.laiguLead.count({ where: { ...scope, isResource: true } }),
      this.prisma.laiguLead.count({ where: { ...scope, phone: { not: null } } }),
      this.prisma.laiguLead.count({
        where: { ...scope, lastMessageAt: { gte: dayStart } },
      }),
    ]);
    return { total, resourced, with_phone: withPhone, today };
  }

  async leadDetail(id: number) {
    const lead = await this.prisma.laiguLead.findUnique({ where: { id } });
    if (!lead) return null;
    return {
      id: lead.id,
      session_id: lead.sessionId,
      client_id: lead.clientId,
      client_name: lead.clientName,
      phone: lead.phone,
      is_resource: lead.isResource,
      source: lead.source,
      sub_source: lead.subSource,
      chat_entry: lead.chatEntry,
      ip_location: lead.ipLocation,
      client_attrs: lead.clientAttrs,
      ad_info: lead.adInfo,
      message_count: lead.messageCount,
      client_message_count: lead.clientMessageCount,
      first_message_at: lead.firstMessageAt,
      last_message_at: lead.lastMessageAt,
      session_created_at: lead.sessionCreatedAt,
      session_ended_at: lead.sessionEndedAt,
      fetched_at: lead.fetchedAt,
      raw_json: lead.rawJson,
    };
  }
}
