import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractKeywords } from '../common/text-keywords';
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

  /** 用户反馈分析聚合（特斯拉面板）：会话级评论分类/情感/高频话题，规则引擎无外部依赖 */
  async feedbackAnalysis(query: { brandId?: string; days?: string }) {
    const brandId = Number(query.brandId ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const days = Math.min(90, Math.max(1, Number(query.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.laiguLead.findMany({
      where: {
        brandId,
        OR: [{ lastMessageAt: { gte: since } }, { sessionCreatedAt: { gte: since } }],
      },
      select: {
        id: true,
        clientName: true,
        lastClientContent: true,
        isResource: true,
        phone: true,
        messageCount: true,
        clientMessageCount: true,
        lastMessageAt: true,
        sessionCreatedAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 5000,
    });

    const PRICE_WORDS = ['价格', '多少钱', '少钱', '落地', '优惠', '便宜', '报价', '贷款', '分期', '几万', '预算', '定金', '订金'];
    const PRODUCT_WORDS = ['续航', '空间', '配置', '充电', '电耗', '油耗', '对比', '性能', '马力', '尺寸', '后备箱', '内饰', '试驾', '保险', '提车', '交付', '版本', '选装'];
    const NEG_WORDS = ['问题', '投诉', '差评', '失望', '故障', '异响', '维权', '吐槽', '后悔', '坑', '垃圾', '修不好', '扯皮'];
    const POS_WORDS = ['好看', '漂亮', '喜欢', '点赞', '不错', '支持', '厉害', '羡慕', '真香', '满意', '舒服', '推荐', '称赞'];

    const classify = (text: string): { category: string; sentiment: '正面' | '中性' | '负面' } => {
      const s = text ?? '';
      const has = (list: string[]) => list.some((w) => s.includes(w));
      if (has(NEG_WORDS)) return { category: '负面评价', sentiment: '负面' };
      if (has(POS_WORDS)) return { category: '正面评价', sentiment: '正面' };
      if (has(PRICE_WORDS)) return { category: '价格咨询', sentiment: '中性' };
      if (has(PRODUCT_WORDS)) return { category: '产品咨询', sentiment: '中性' };
      return { category: '闲聊互动', sentiment: '中性' };
    };

    const catCount = new Map<string, number>();
    const sentiCount = new Map<string, number>();
    let leads = 0;
    let withPhone = 0;
    let replied = 0;
    const detail: {
      id: number;
      author: string;
      content: string;
      category: string;
      sentiment: string;
      isLead: boolean;
      replied: boolean;
      time: string;
    }[] = [];
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let today = 0;
    const contents: string[] = [];
    for (const r of rows) {
      const text = r.lastClientContent ?? '';
      const { category, sentiment } = classify(text);
      catCount.set(category, (catCount.get(category) ?? 0) + 1);
      sentiCount.set(sentiment, (sentiCount.get(sentiment) ?? 0) + 1);
      if (r.isResource) leads += 1;
      if (r.phone) withPhone += 1;
      const repliedRow = r.messageCount - r.clientMessageCount > 0;
      if (repliedRow) replied += 1;
      const lastAt = r.lastMessageAt ?? r.sessionCreatedAt;
      if (lastAt && lastAt >= dayStart) today += 1;
      if (text) contents.push(text);
      if (detail.length < 500) {
        detail.push({
          id: r.id,
          author: r.clientName ?? '匿名用户',
          content: text || '（无文字内容）',
          category,
          sentiment,
          isLead: !!r.isResource,
          replied: repliedRow,
          time: (r.lastMessageAt ?? r.sessionCreatedAt ?? new Date()).toISOString(),
        });
      }
    }
    const total = rows.length;
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return {
      days,
      total,
      today,
      leads,
      with_phone: withPhone,
      replied,
      pending: total - replied,
      reply_rate: pct(replied),
      sentiment: (['正面', '中性', '负面'] as const).map((name) => ({
        name,
        count: sentiCount.get(name) ?? 0,
        pct: pct(sentiCount.get(name) ?? 0),
      })),
      categories: [...catCount.entries()]
        .map(([name, count]) => ({ name, count, pct: pct(count) }))
        .sort((a, b) => b.count - a.count),
      comments: detail,
      topics: extractKeywords(contents, 30),
      scope_note: '数据源=来鼓私信会话（用户最后一条消息），非小红书笔记评论；分类/情感为关键词规则引擎判定',
    };
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
