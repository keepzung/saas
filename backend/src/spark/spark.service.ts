import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RtbAccountMetrics, SparkApiClient, SparkCookieExpiredError } from './spark-api.client';

const RTB_PAGE_SIZE = 500;
const MAX_PAGES = 10;
const SPARK_BRAND_ID = 2;

export interface SyncResult {
  syncType: string;
  statDate: string;
  status: string;
  fetched: number;
  upserted: number;
  accountsAdded: number;
  accountsRemoved: number;
  message?: string;
}

@Injectable()
export class SparkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SparkService.name);
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: SparkApiClient,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const minutes = Number(
      this.configService.get<string>('SPARK_SYNC_INTERVAL_MINUTES') ?? 60,
    );
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('星火定时同步已禁用（SPARK_SYNC_INTERVAL_MINUTES<=0）');
      return;
    }
    setTimeout(() => {
      this.safeSync().catch(() => undefined);
    }, 30_000).unref();
    this.syncTimer = setInterval(() => {
      this.safeSync().catch(() => undefined);
    }, minutes * 60_000);
    this.syncTimer.unref();
    this.logger.log(`星火定时同步已启动：每 ${minutes} 分钟检查（T+1 分区未同步时执行）`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  /** T+1 同步目标日 = 北京时间昨天（昨日全天数据已就绪） */
  private syncDate(): string {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const yesterday = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - 86400000);
    return yesterday.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  }

  /** 定时入口：昨日若未同步则执行（幂等，跳过已同步日期） */
  private async safeSync() {
    try {
      const statDate = this.syncDate();
      const done = await this.prisma.sparkSyncLog.findFirst({
        where: { syncType: 'campaign', statDate, status: 'success' },
      });
      if (done) return;
      const result = await this.syncCampaign(statDate);
      this.logger.log(
        `星火投放同步完成 ${statDate}：入库 ${result.upserted} 行，新增账户 ${result.accountsAdded}，移除 ${result.accountsRemoved}`,
      );
    } catch (error) {
      if (error instanceof SparkCookieExpiredError) {
        this.logger.warn(`星火定时同步跳过：${error.message}`);
        return;
      }
      this.logger.warn(`星火定时同步失败: ${(error as Error).message}`);
    }
  }

  /** 同步聚光投放账户日数据（默认昨天；可指定日期补数） */
  async syncCampaign(date?: string): Promise<SyncResult> {
    if (this.syncing) throw new Error('同步进行中，请稍后再试');
    this.syncing = true;
    try {
      const statDate = date ?? this.syncDate();
      const rows: RtbAccountMetrics[] = [];
      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex += 1) {
        const data = await this.api.rtbMetrics({
          timeStart: statDate,
          timeEnd: statDate,
          pageIndex,
          pageSize: RTB_PAGE_SIZE,
        });
        rows.push(...(data.rtbAccountMetricsVos ?? []));
        if (rows.length >= (data.total ?? 0) || !(data.rtbAccountMetricsVos ?? []).length) {
          break;
        }
      }

      const num = (v: unknown): number => {
        const n = Number(v ?? 0);
        return Number.isFinite(n) ? n : 0;
      };
      const day = new Date(`${statDate}T00:00:00.000Z`);

      let upserted = 0;
      const sellerIds = new Set<string>();
      for (const r of rows) {
        if (!r.virtualSellerId) continue;
        sellerIds.add(r.virtualSellerId);
        const isSub = !!r.subAccount?.agentSubAccountId;
        await this.prisma.koxCampaignDailyStat.upsert({
          where: { statDate_virtualSellerId: { statDate: day, virtualSellerId: r.virtualSellerId } },
          create: {
            statDate: day,
            virtualSellerId: r.virtualSellerId,
            brandUserId: r.brand?.brandUserId ?? null,
            brandUserName: r.brand?.brandUserName ?? null,
            advertiserId: r.advertiserId != null ? String(r.advertiserId) : null,
            accountKind: isSub ? 'agent_sub' : 'brand',
            agentName: r.agent?.agentUserName ?? null,
            fee: new Prisma.Decimal(num(r.fee)),
            impression: num(r.impression),
            click: num(r.click),
            likeCnt: num(r.like),
            commentCnt: num(r.comment),
            collectCnt: num(r.collect),
            shareCnt: num(r.share),
            interaction: num(r.interaction),
            msgLeadsNum: num(r.msgLeadsNum),
            leads: num(r.leads),
            brandId: SPARK_BRAND_ID,
            rawJson: r as Prisma.InputJsonValue,
          },
          update: {
            fee: new Prisma.Decimal(num(r.fee)),
            impression: num(r.impression),
            click: num(r.click),
            likeCnt: num(r.like),
            commentCnt: num(r.comment),
            collectCnt: num(r.collect),
            shareCnt: num(r.share),
            interaction: num(r.interaction),
            msgLeadsNum: num(r.msgLeadsNum),
            leads: num(r.leads),
          },
        });
        upserted += 1;
      }

      // 账户镜像 diff（新增/移除）
      const accountsAdded = await this.mirrorAccounts(rows, sellerIds);

      const result: SyncResult = {
        syncType: 'campaign',
        statDate,
        status: 'success',
        fetched: rows.length,
        upserted,
        accountsAdded,
        accountsRemoved: 0,
      };
      await this.prisma.sparkSyncLog.create({ data: { ...result, message: undefined } });
      return result;
    } finally {
      this.syncing = false;
    }
  }

  /** upsert SparkAccount 镜像并返回新增数；不在此轮出现的账户置 active=false */
  private async mirrorAccounts(rows: RtbAccountMetrics[], sellerIds: Set<string>): Promise<number> {
    let added = 0;
    for (const r of rows) {
      if (!r.virtualSellerId) continue;
      const isSub = !!r.subAccount?.agentSubAccountId;
      const name =
        (isSub ? r.subAccount?.agentSubAccountName : r.brand?.brandUserName) ??
        r.brand?.brandUserName ??
        r.virtualSellerId;
      const existing = await this.prisma.sparkAccount.findUnique({
        where: { virtualSellerId: r.virtualSellerId },
      });
      const data = {
        accountCode: r.accountCode ?? null,
        accountKind: isSub ? 'agent_sub' : 'brand',
        name,
        brandUserId: r.brand?.brandUserId ?? null,
        agentName: r.agent?.agentUserName ?? null,
        advertiserId: r.advertiserId != null ? String(r.advertiserId) : null,
        lastConsumeDate: r.lastConsumeDate ?? null,
        active: true,
        lastSeenAt: new Date(),
        brandId: SPARK_BRAND_ID,
      };
      if (existing) {
        await this.prisma.sparkAccount.update({
          where: { virtualSellerId: r.virtualSellerId },
          data,
        });
      } else {
        await this.prisma.sparkAccount.create({
          data: { virtualSellerId: r.virtualSellerId, ...data },
        });
        added += 1;
      }
    }
    const gone = await this.prisma.sparkAccount.findMany({
      where: { active: true, virtualSellerId: { notIn: [...sellerIds] } },
      select: { id: true },
    });
    if (gone.length) {
      await this.prisma.sparkAccount.updateMany({
        where: { id: { in: gone.map((g) => g.id) } },
        data: { active: false },
      });
    }
    return added;
  }

  async status() {
    const cookieConfigured = this.api.hasCookie();
    let latestCalculate: string | null = null;
    let cookieValid = false;
    let error: string | null = null;
    if (cookieConfigured) {
      try {
        latestCalculate = await this.api.getLatestCalculateDate(
          'redapp.app_ads_crm_mcc_org_brand_note_df',
        );
        cookieValid = latestCalculate !== null;
      } catch (e) {
        error = (e as Error).message;
      }
    }
    const lastLogs = await this.prisma.sparkSyncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const [accountTotal, accountActive] = await Promise.all([
      this.prisma.sparkAccount.count({ where: { brandId: SPARK_BRAND_ID } }),
      this.prisma.sparkAccount.count({ where: { brandId: SPARK_BRAND_ID, active: true } }),
    ]);
    return {
      cookie_configured: cookieConfigured,
      cookie_valid: cookieValid,
      next_sync_date: this.syncDate(),
      latest_calculate_date: latestCalculate,
      error,
      accounts: { total: accountTotal, active: accountActive },
      recent_logs: lastLogs,
    };
  }

  async logs(query: { page?: string; page_size?: string; syncType?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where: Prisma.SparkSyncLogWhereInput = {};
    if (query.syncType) where.syncType = query.syncType;
    const [total, rows] = await Promise.all([
      this.prisma.sparkSyncLog.count({ where }),
      this.prisma.sparkSyncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { list: rows, total, page, page_size: pageSize };
  }

  /** 投放汇总：指标卡 + 逐日趋势 */
  async campaignSummary(query: { start?: string; end?: string; brandId?: string }) {
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);
    const brandId = query.brandId ? Number(query.brandId) : SPARK_BRAND_ID;

    const rows = await this.prisma.koxCampaignDailyStat.findMany({
      where: { statDate: { gte: start, lte: end }, brandId },
      orderBy: { statDate: 'asc' },
    });

    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + f(r), 0);
    const totalFee = rows.reduce((acc, r) => acc + Number(r.fee), 0);
    const totalMsgLeads = sum((r) => r.msgLeadsNum);

    const dayMap = new Map<string, { fee: number; impression: number; click: number; msg_leads: number; accounts: Set<string> }>();
    for (const r of rows) {
      const key = r.statDate.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { fee: 0, impression: 0, click: 0, msg_leads: 0, accounts: new Set<string>() };
      cur.fee += Number(r.fee);
      cur.impression += r.impression;
      cur.click += r.click;
      cur.msg_leads += r.msgLeadsNum;
      cur.accounts.add(r.virtualSellerId);
      dayMap.set(key, cur);
    }

    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      total: rows.length,
      summary: {
        consume_days: dayMap.size,
        account_num: new Set(rows.map((r) => r.virtualSellerId)).size,
        fee: Math.round(totalFee * 100) / 100,
        impression: sum((r) => r.impression),
        click: sum((r) => r.click),
        ctr: sum((r) => r.impression)
          ? Math.round((sum((r) => r.click) / sum((r) => r.impression)) * 10000) / 100
          : 0,
        interaction: sum((r) => r.interaction),
        msg_leads: totalMsgLeads,
        msg_lead_cost: totalMsgLeads ? Math.round((totalFee / totalMsgLeads) * 10) / 10 : 0,
      },
      trend: [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({
          date,
          fee: Math.round(v.fee * 100) / 100,
          impression: v.impression,
          click: v.click,
          msg_leads: v.msg_leads,
          active_accounts: v.accounts.size,
        })),
    };
  }

  /** 账户级投放列表（时间范围内聚合） */
  async campaignAccounts(query: {
    start?: string;
    end?: string;
    keyword?: string;
    accountKind?: string;
    metric?: string;
    page?: string;
    page_size?: string;
    brandId?: string;
  }) {
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);
    const brandId = query.brandId ? Number(query.brandId) : SPARK_BRAND_ID;

    const rows = await this.prisma.koxCampaignDailyStat.findMany({
      where: {
        statDate: { gte: start, lte: end },
        brandId,
        ...(query.accountKind ? { accountKind: query.accountKind } : {}),
      },
    });

    const agg = new Map<
      string,
      {
        virtual_seller_id: string;
        name: string;
        account_kind: string;
        agent_name: string | null;
        advertiser_id: string | null;
        brand_user_id: string | null;
        consume_days: number;
        fee: number;
        impression: number;
        click: number;
        like: number;
        comment: number;
        collect: number;
        share: number;
        interaction: number;
        msg_leads: number;
        leads: number;
      }
    >();
    for (const r of rows) {
      const cur =
        agg.get(r.virtualSellerId) ??
        {
          virtual_seller_id: r.virtualSellerId,
          name: r.brandUserName ?? r.virtualSellerId,
          account_kind: r.accountKind,
          agent_name: r.agentName,
          advertiser_id: r.advertiserId,
          brand_user_id: r.brandUserId,
          consume_days: 0,
          fee: 0,
          impression: 0,
          click: 0,
          like: 0,
          comment: 0,
          collect: 0,
          share: 0,
          interaction: 0,
          msg_leads: 0,
          leads: 0,
        };
      if (Number(r.fee) > 0) cur.consume_days += 1;
      cur.fee += Number(r.fee);
      cur.impression += r.impression;
      cur.click += r.click;
      cur.like += r.likeCnt;
      cur.comment += r.commentCnt;
      cur.collect += r.collectCnt;
      cur.share += r.shareCnt;
      cur.interaction += r.interaction;
      cur.msg_leads += r.msgLeadsNum;
      cur.leads += r.leads;
      agg.set(r.virtualSellerId, cur);
    }

    const METRIC_KEYS = ['fee', 'impression', 'click', 'interaction', 'msg_leads', 'leads'] as const;
    type MetricKey = (typeof METRIC_KEYS)[number];
    const metric: MetricKey = (METRIC_KEYS as readonly string[]).includes(query.metric ?? '')
      ? (query.metric as MetricKey)
      : 'fee';

    let list = [...agg.values()];
    if (query.keyword) {
      const kw = query.keyword.trim();
      list = list.filter(
        (a) => a.name.includes(kw) || (a.agent_name ?? '').includes(kw) || (a.advertiser_id ?? '').includes(kw),
      );
    }
    list.sort((a, b) => (b[metric] as number) - (a[metric] as number));

    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 20) || 20));

    return {
      metric,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      total: list.length,
      page,
      page_size: pageSize,
      list: list
        .slice((page - 1) * pageSize, page * pageSize)
        .map((a, i) => ({
          rank: (page - 1) * pageSize + i + 1,
          ...a,
          fee: Math.round(a.fee * 100) / 100,
          ctr: a.impression ? Math.round((a.click / a.impression) * 10000) / 100 : 0,
          msg_lead_cost: a.msg_leads ? Math.round((a.fee / a.msg_leads) * 10) / 10 : 0,
        })),
    };
  }

  /** 账户镜像列表（含增减状态） */
  async accounts(query: { keyword?: string; active?: string; page?: string; page_size?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where: Prisma.SparkAccountWhereInput = {};
    if (query.active !== undefined && query.active !== '') {
      where.active = query.active === 'true' || query.active === '1';
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { brandUserId: { contains: query.keyword } },
        { advertiserId: { contains: query.keyword } },
      ];
    }
    const [total, rows, addedToday, removedTotal] = await Promise.all([
      this.prisma.sparkAccount.count({ where }),
      this.prisma.sparkAccount.findMany({
        where,
        orderBy: [{ active: 'desc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sparkAccount.count({
        where: { firstSeenAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
      this.prisma.sparkAccount.count({ where: { active: false } }),
    ]);
    return {
      list: rows.map((a) => ({
        id: a.id,
        virtual_seller_id: a.virtualSellerId,
        name: a.name,
        account_kind: a.accountKind,
        brand_user_id: a.brandUserId,
        agent_name: a.agentName,
        advertiser_id: a.advertiserId,
        last_consume_date: a.lastConsumeDate,
        active: a.active,
        first_seen_at: a.firstSeenAt,
        last_seen_at: a.lastSeenAt,
      })),
      total,
      page,
      page_size: pageSize,
      added_last_24h: addedToday,
      removed_total: removedTotal,
    };
  }

  updateCookie(cookie: string) {
    this.api.updateCookie(cookie);
    this.logger.log('星火 cookie 已运行时更新（注意：重启后将恢复为 .env 配置）');
    return { ok: true };
  }
}
