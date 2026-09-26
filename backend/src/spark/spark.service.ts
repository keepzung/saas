import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SparkOrgCtx, SparkOrgRegistry } from './spark-org.registry';
import { RtbAccountMetrics, SparkApiClient, SparkCookieExpiredError } from './spark-api.client';

const RTB_PAGE_SIZE = 500;
const MAX_PAGES = 10;
const NOTE_PAGE_SIZE = 100;
const NOTE_DAILY_MAX_PAGES = 30;
const NOTE_BACKFILL_MAX_PAGES = 80;
const NOTE_FULL_MAX_PAGES = 700;
const NOTE_PROMOTED_MAX_PAGES = 30;
const NOTE_WINDOW_DAYS = 30;
/** 查询类接口缺省品牌（荣威）；同步写入的品牌取自组织上下文 */
const SPARK_DEFAULT_BRAND_ID = 2;

export interface SyncResult {
  syncType: string;
  statDate: string;
  status: string;
  fetched: number;
  upserted: number;
  accountsAdded: number;
  accountsRemoved: number;
  message?: string;
  brandId?: number;
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
    private readonly orgs: SparkOrgRegistry,
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

  /** 全部活跃组织的 brandId 列表（手动同步遍历用） */
  async activeOrgBrandIds(): Promise<number[]> {
    const orgs = await this.orgs.activeOrgs();
    return orgs.map((o) => o.brandId);
  }

  /** 组织上下文（手动同步用）；无配置返回 null */
  async orgCtx(brandId: number): Promise<SparkOrgCtx | null> {
    return this.orgs.forBrand(brandId);
  }

  /** 定时入口：遍历全部活跃组织，昨日若未同步则执行（幂等，跳过已同步日期）；投放与笔记互相独立 */
  private async safeSync() {
    try {
      const orgs = await this.orgs.activeOrgs();
      if (!orgs.length) {
        this.logger.warn('星火定时同步跳过：无活跃组织配置');
        return;
      }
      for (const org of orgs) {
        await this.safeSyncOrg(
          { brandId: org.brandId, orgCode: org.orgCode, cookie: org.cookie, email: org.email },
        );
      }
    } catch (error) {
      this.logger.warn(`星火定时同步失败: ${(error as Error).message}`);
    }
  }

  private async safeSyncOrg(ctx: SparkOrgCtx) {
    const statDate = this.syncDate();
    for (const [type, runner] of [
      ['campaign', () => this.syncCampaign(undefined, ctx)],
      ['notes', () => this.syncNotes(undefined, undefined, ctx)],
    ] as const) {
      const done = await this.prisma.sparkSyncLog.findFirst({
        where: { syncType: type, statDate, status: 'success', brandId: ctx.brandId },
      });
      if (done && !(type === 'notes' && done.fetched === 0)) continue;
      try {
        const result = await runner();
        this.logger.log(
          `星火${type} 同步完成 brand=${ctx.brandId} ${statDate}：拉取 ${result.fetched}，入库 ${result.upserted}`,
        );
      } catch (error) {
        if (error instanceof SparkCookieExpiredError) {
          this.logger.warn(
            `星火${type} 同步跳过 brand=${ctx.brandId}：${error.message}`,
          );
          continue;
        }
        this.logger.warn(
          `星火${type} 同步失败 brand=${ctx.brandId}: ${(error as Error).message}`,
        );
      }
    }
    await this.orgs.markSynced(ctx.brandId);
  }

  /** 同步聚光投放账户日数据（默认昨天；可指定日期补数；ctx 指定目标组织） */
  async syncCampaign(date?: string, ctx?: SparkOrgCtx): Promise<SyncResult> {
    if (this.syncing) throw new Error('同步进行中，请稍后再试');
    this.syncing = true;
    try {
      const org = ctx ?? (await this.orgs.forBrand());
      if (!org) throw new Error('无可用星火组织配置');
      const statDate = date ?? this.syncDate();
      const rows: RtbAccountMetrics[] = [];
      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex += 1) {
        const data = await this.api.rtbMetrics(
          {
            timeStart: statDate,
            timeEnd: statDate,
            pageIndex,
            pageSize: RTB_PAGE_SIZE,
          },
          org,
        );
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
            msgChatUserCnt: num(r.msgChatUserCnt),
            messageConsult: num(r.messageConsult),
            leads: num(r.leads),
            brandId: org.brandId,
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
            msgChatUserCnt: num(r.msgChatUserCnt),
            messageConsult: num(r.messageConsult),
            leads: num(r.leads),
          },
        });
        upserted += 1;
      }

      // 账户镜像 diff（新增/移除）
      const accountsAdded = await this.mirrorAccounts(rows, sellerIds, org.brandId);

      const result: SyncResult = {
        syncType: 'campaign',
        statDate,
        status: 'success',
        fetched: rows.length,
        upserted,
        accountsAdded,
        accountsRemoved: 0,
      };
      await this.prisma.sparkSyncLog.create({
        data: { ...result, message: undefined, brandId: org.brandId },
      });
      return result;
    } finally {
      this.syncing = false;
    }
  }

  /**
   * 同步笔记明细（指标为近30天累计快照）：
   * - daily（默认）：note_publish_date = statDate~今日
   * - backfill：近35天发布
   * - full：全量历史（无发布日期筛选）
   * - promoted：仅已推广（刷新投流状态）
   */
  async syncNotes(
    date?: string,
    opts?: { backfill?: boolean; full?: boolean; promoted?: boolean },
    ctx?: SparkOrgCtx,
  ): Promise<SyncResult> {
    const org = ctx ?? (await this.orgs.forBrand());
    if (!org) throw new Error('无可用星火组织配置');
    const statDate = date ?? this.syncDate();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const maxPages = opts?.full
      ? NOTE_FULL_MAX_PAGES
      : opts?.backfill
        ? NOTE_BACKFILL_MAX_PAGES
        : opts?.promoted
          ? NOTE_PROMOTED_MAX_PAGES
          : NOTE_DAILY_MAX_PAGES;
    const publishStart = opts?.full || opts?.promoted
      ? undefined
      : opts?.backfill
        ? new Date(new Date(`${statDate}T00:00:00+08:00`).getTime() - 34 * 86400000)
            .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
        : statDate;
    const timeStart = new Date(
      new Date(`${statDate}T00:00:00+08:00`).getTime() - (NOTE_WINDOW_DAYS - 1) * 86400000,
    )
      .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

    const rows: Record<string, unknown>[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const data = await this.api.noteDetailList(
        {
          timeStart,
          timeEnd: statDate,
          publishStart,
          publishEnd: today,
          promotedOnly: !!opts?.promoted,
          pageNo,
          pageSize: NOTE_PAGE_SIZE,
        },
        org,
      );
      total = data.total;
      rows.push(...data.rows);
      if (rows.length >= data.total || !data.rows.length) break;
    }

    const num = (v: unknown): number => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      const s = String(v ?? '').replace(/,/g, '').trim();
      if (!s || s === '-' || s === '--') return 0;
      if (/万$/.test(s)) return Math.round(parseFloat(s) * 10000) || 0;
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const parseDate = (v: unknown): Date | null => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') {
        const d = new Date(v > 1e12 ? v : v * 1000);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(String(v).replace(/-/g, '/'));
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const accounts = await this.prisma.kosAccount.findMany({
      where: { brandId: org.brandId },
      select: { id: true, nickname: true, storeName: true, accountType: true },
    });
    const byNickname = new Map<string, number>();
    const byStore = new Map<string, number>();
    for (const a of accounts) {
      if (a.nickname) byNickname.set(a.nickname, a.id);
      if (a.storeName) byStore.set(a.storeName, a.id);
    }

    const day = new Date(`${statDate}T00:00:00.000Z`);
    let upserted = 0;
    for (const r of rows) {
      const pick = (code: string): unknown => {
        if (r[code] !== undefined && r[code] !== null && r[code] !== '') return r[code];
        const list = Array.isArray(r.targetList)
          ? (r.targetList as {
              targetCode?: string;
              targetValue?: unknown;
              targetOriginValue?: unknown;
              targetDownloadValue?: unknown;
              linkVos?: { targetCode?: string; targetValue?: unknown }[];
            }[])
          : Array.isArray(r.targetVos)
            ? (r.targetVos as {
                targetCode?: string;
                targetValue?: unknown;
                targetOriginValue?: unknown;
                targetDownloadValue?: unknown;
                linkVos?: { targetCode?: string; targetValue?: unknown }[];
              }[])
            : null;
        if (!list) return undefined;
        const hit = list.find((t) => t.targetCode === code);
        if (!hit) return undefined;
        if (hit.targetValue != null && hit.targetValue !== '') return hit.targetValue;
        if (hit.targetOriginValue != null && hit.targetOriginValue !== '') {
          return hit.targetOriginValue;
        }
        if (hit.targetDownloadValue != null && hit.targetDownloadValue !== '') {
          return hit.targetDownloadValue;
        }
        return undefined;
      };
      const pickLink = (code: string): unknown => {
        const list = Array.isArray(r.targetList)
          ? (r.targetList as { linkVos?: { targetCode?: string; targetValue?: unknown }[] }[])
          : Array.isArray(r.targetVos)
            ? (r.targetVos as { linkVos?: { targetCode?: string; targetValue?: unknown }[] }[])
            : null;
        for (const t of list ?? []) {
          const hit = (t.linkVos ?? []).find((l) => l.targetCode === code);
          if (hit?.targetValue != null && hit.targetValue !== '') return hit.targetValue;
        }
        return undefined;
      };
      const title = String(pick('note_title') ?? '').trim();
      const authorName = String(pick('author_name') ?? pickLink('author_name') ?? '').trim();
      if (!title && !authorName) continue;

      const noteIdRaw = String(pick('note_id') ?? pickLink('note_id') ?? '').trim();
      const publishTime = parseDate(pick('note_publish_time'));
      const noteId =
        noteIdRaw ||
        `spark_${createHash('md5')
          .update(`${title}|${authorName}|${publishTime?.toISOString() ?? ''}`)
          .digest('hex')
          .slice(0, 24)}`;

      const brandUserName = String(pick('brand_user_name') ?? '').trim() || null;
      const accountId =
        byNickname.get(authorName) ?? (brandUserName ? byStore.get(brandUserName) ?? null : null);

      const noteUrlRaw = String(pickLink('note_link') ?? pick('note_link') ?? '').trim();
      const rtbRaw = String(pick('is_rtb_adver') ?? '').trim();
      const isRtbAdver = rtbRaw
        ? rtbRaw === '1' ||
          rtbRaw.toLowerCase() === 'true' ||
          rtbRaw.includes('已推广')
        : null;

      const data = {
        accountId,
        brandId: org.brandId,
        title: title || '(无标题)',
        content: null,
        noteUrl: noteUrlRaw || (noteIdRaw ? `https://www.xiaohongshu.com/explore/${noteIdRaw}` : null),
        noteType: String(pick('note_type') ?? '') === '2' ? 'video' : 'normal',
        isRtbAdver,
        publishTime,
        exposure: num(pick('imp_num')),
        views: num(pick('read_feed_num')),
        likes: num(pick('like_num')),
        collects: num(pick('fav_num')),
        comments: num(pick('cmt_num')),
        shares: num(pick('share_num')),
        followCount: num(pick('follow_num')),
        authorName: authorName || null,
        accountType: 'KOS',
        statDate: day,
        rawJson: r as Prisma.InputJsonValue,
      };
      await this.prisma.koxNote.upsert({
        where: { noteId },
        create: { noteId, ...data },
        update: data,
      });
      upserted += 1;
    }

    const result: SyncResult = {
      syncType: 'notes',
      statDate,
      status: 'success',
      fetched: rows.length,
      upserted,
      accountsAdded: 0,
      accountsRemoved: 0,
      message: `total=${total}${opts?.backfill ? ' (backfill)' : ''}${opts?.full ? ' (full)' : ''}${opts?.promoted ? ' (promoted)' : ''}`,
      brandId: org.brandId,
    };
    await this.prisma.sparkSyncLog.create({ data: result });
    return result;
  }

  /** upsert SparkAccount 镜像并返回新增数；不在此轮出现的账户置 active=false */
  /** 启发式归属（仅荣威历史规则）：主机厂直营/总部素材号 → hq，其余（含其他组织）dealer */
  private guessScope(brandId: number, name: string): string {
    if (brandId !== 2) return 'dealer';
    return /^荣威ROEWE$/.test(name) ||
      /^MV_华东_上汽荣威/.test(name) ||
      /^上汽集团/.test(name) ||
      /乘用车分公司/.test(name) ||
      /^荣威-科莱/.test(name)
      ? 'hq'
      : 'dealer';
  }

  private async mirrorAccounts(
    rows: RtbAccountMetrics[],
    sellerIds: Set<string>,
    brandId: number,
  ): Promise<number> {
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
      };
      if (existing) {
        // 注意：更新不改写 brandId，避免跨组织同名/同 ID 账户来回漂移
        await this.prisma.sparkAccount.update({
          where: { virtualSellerId: r.virtualSellerId },
          data,
        });
      } else {
        await this.prisma.sparkAccount.create({
          data: {
            virtualSellerId: r.virtualSellerId,
            ...data,
            brandId,
            scope: this.guessScope(brandId, name),
          },
        });
        added += 1;
      }
    }
    const gone = await this.prisma.sparkAccount.findMany({
      where: { active: true, brandId, virtualSellerId: { notIn: [...sellerIds] } },
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

  /** 运行状态：?brandId= 按组织探测；未传时探测默认品牌并附带全部组织概览 */
  async status(brandIdParam?: string) {
    const brandId = brandIdParam ? Number(brandIdParam) : SPARK_DEFAULT_BRAND_ID;
    const orgRows = await this.orgs.list();
    const target = orgRows.find((o) => o.brandId === brandId);
    const cookieConfigured = target
      ? target.cookie.length > 0
      : this.api.hasCookie();
    let latestCalculate: string | null = null;
    let cookieValid = false;
    let error: string | null = null;
    if (cookieConfigured) {
      try {
        const ctx = await this.orgs.forBrand(brandId);
        latestCalculate = await this.api.getLatestCalculateDate(
          'redapp.app_ads_crm_mcc_org_brand_note_df',
          ctx ?? undefined,
        );
        cookieValid = latestCalculate !== null;
      } catch (e) {
        error = (e as Error).message;
      }
    }
    const lastLogs = await this.prisma.sparkSyncLog.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const [accountTotal, accountActive] = await Promise.all([
      this.prisma.sparkAccount.count({ where: { brandId } }),
      this.prisma.sparkAccount.count({ where: { brandId, active: true } }),
    ]);
    const orgs = orgRows.map((o) => ({
      brand_id: o.brandId,
      org_code: o.orgCode,
      email: o.email,
      active: o.active,
      cookie_configured: o.cookie.length > 0,
      last_sync_at: o.lastSyncAt,
      remark: o.remark,
    }));
    return {
      brand_id: brandId,
      cookie_configured: cookieConfigured,
      cookie_valid: cookieValid,
      next_sync_date: this.syncDate(),
      latest_calculate_date: latestCalculate,
      error,
      accounts: { total: accountTotal, active: accountActive },
      recent_logs: lastLogs,
      orgs,
    };
  }

  async logs(query: {
    page?: string;
    page_size?: string;
    syncType?: string;
    brandId?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where: Prisma.SparkSyncLogWhereInput = {};
    if (query.syncType) where.syncType = query.syncType;
    if (query.brandId) where.brandId = Number(query.brandId);
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

  /** scope → 星火账户 virtualSellerId 集合（null = 不过滤） */
  private async scopeSellerIds(scope?: string): Promise<string[] | null> {
    if (!scope || scope === 'all') return null;
    const rows = await this.prisma.sparkAccount.findMany({
      where: { scope },
      select: { virtualSellerId: true },
    });
    return rows.map((r) => r.virtualSellerId);
  }

  /** 总部账户名称集合（笔记 brand_user_name 与其对应） */
  private async hqAccountNames(): Promise<string[]> {
    const rows = await this.prisma.sparkAccount.findMany({
      where: { scope: 'hq' },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  /** 投放汇总：指标卡 + 逐日趋势（scope 可选 dealer/hq） */
  async campaignSummary(query: {
    start?: string;
    end?: string;
    brandId?: string;
    scope?: string;
  }) {
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);
    const brandId = query.brandId ? Number(query.brandId) : SPARK_DEFAULT_BRAND_ID;
    const sellerIds = await this.scopeSellerIds(query.scope);

    const rows = await this.prisma.koxCampaignDailyStat.findMany({
      where: {
        statDate: { gte: start, lte: end },
        brandId,
        ...(sellerIds ? { virtualSellerId: { in: sellerIds } } : {}),
      },
      orderBy: { statDate: 'asc' },
    });

    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + f(r), 0);
    const totalFee = rows.reduce((acc, r) => acc + Number(r.fee), 0);
    const totalMsgLeads = sum((r) => r.msgLeadsNum);
    const totalConsult = sum((r) => r.messageConsult);
    const totalOpen = sum((r) => r.msgChatUserCnt);
    const totalImpression = sum((r) => r.impression);
    const totalClick = sum((r) => r.click);

    const dayMap = new Map<string, { fee: number; impression: number; click: number; msg_leads: number; consult: number; open: number; accounts: Set<string> }>();
    for (const r of rows) {
      const key = r.statDate.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { fee: 0, impression: 0, click: 0, msg_leads: 0, consult: 0, open: 0, accounts: new Set<string>() };
      cur.fee += Number(r.fee);
      cur.impression += r.impression;
      cur.click += r.click;
      cur.msg_leads += r.msgLeadsNum;
      cur.consult += r.messageConsult;
      cur.open += r.msgChatUserCnt;
      cur.accounts.add(r.virtualSellerId);
      dayMap.set(key, cur);
    }
    const r2v = (v: number) => Math.round(v * 100) / 100;

    // 投流内容数 = 全部历史中被投流推广的笔记数（按 scope 拆分：笔记主体名 ∈ 总部账户名集合）
    const promoWhere: Prisma.KoxNoteWhereInput = {
      brandId,
      isRtbAdver: true,
    };
    if (query.scope === 'hq' || query.scope === 'dealer') {
      const hqNames = await this.hqAccountNames();
      promoWhere.brandUserName = query.scope === 'hq'
        ? { in: hqNames }
        : { notIn: hqNames };
    }
    const promo_note_cnt = await this.prisma.koxNote.count({ where: promoWhere });

    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      total: rows.length,
      promo_note_cnt,
      summary: {
        promo_note_cnt,
        consume_days: dayMap.size,
        account_num: new Set(rows.map((r) => r.virtualSellerId)).size,
        fee: r2v(totalFee),
        impression: totalImpression,
        click: totalClick,
        ctr: totalImpression ? r2v((totalClick / totalImpression) * 100) : 0,
        cpc: totalClick ? r2v(totalFee / totalClick) : 0,
        cpm: totalImpression ? r2v((totalFee / totalImpression) * 1000) : 0,
        interaction: sum((r) => r.interaction),
        msg_inquiries: totalConsult,
        msg_openings: totalOpen,
        msg_leads: totalMsgLeads,
        msg_inquiry_cost: totalConsult ? r2v(totalFee / totalConsult) : 0,
        msg_open_cost: totalOpen ? r2v(totalFee / totalOpen) : 0,
        msg_lead_cost: totalMsgLeads ? r2v(totalFee / totalMsgLeads) : 0,
      },
      trend: [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({
          date,
          fee: r2v(v.fee),
          impression: v.impression,
          click: v.click,
          msg_inquiries: v.consult,
          msg_openings: v.open,
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
    scope?: string;
  }) {
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);
    const brandId = query.brandId ? Number(query.brandId) : SPARK_DEFAULT_BRAND_ID;
    const sellerIds = await this.scopeSellerIds(query.scope);

    const rows = await this.prisma.koxCampaignDailyStat.findMany({
      where: {
        statDate: { gte: start, lte: end },
        brandId,
        ...(query.accountKind ? { accountKind: query.accountKind } : {}),
        ...(sellerIds ? { virtualSellerId: { in: sellerIds } } : {}),
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
        msg_inquiries: number;
        msg_openings: number;
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
        msg_inquiries: 0,
        msg_openings: 0,
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
      cur.msg_inquiries += r.messageConsult;
      cur.msg_openings += r.msgChatUserCnt;
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
          msg_inquiry_cost: a.msg_inquiries ? Math.round((a.fee / a.msg_inquiries) * 10) / 10 : 0,
          msg_open_cost: a.msg_openings ? Math.round((a.fee / a.msg_openings) * 10) / 10 : 0,
          msg_lead_cost: a.msg_leads ? Math.round((a.fee / a.msg_leads) * 10) / 10 : 0,
        })),
    };
  }

  /** 账户镜像列表（含增减状态与归属） */
  async accounts(query: {
    keyword?: string;
    active?: string;
    scope?: string;
    page?: string;
    page_size?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where: Prisma.SparkAccountWhereInput = {};
    if (query.active !== undefined && query.active !== '') {
      where.active = query.active === 'true' || query.active === '1';
    }
    if (query.scope === 'hq' || query.scope === 'dealer') where.scope = query.scope;
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
        scope: a.scope,
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

  async updateAccountScope(id: number, scope: string) {
    if (!['hq', 'dealer'].includes(scope)) {
      throw new Error('scope 仅支持 hq / dealer');
    }
    const existing = await this.prisma.sparkAccount.findUnique({ where: { id } });
    if (!existing) throw new Error('账户不存在');
    await this.prisma.sparkAccount.update({ where: { id }, data: { scope } });
    return { id, scope };
  }

  /** 更新星火 cookie：带 brandId 时落库到对应组织（重启不丢），否则沿用旧的运行时热更（仅 .env 品牌） */
  async updateCookie(cookie: string, brandIdParam?: string) {
    if (brandIdParam) {
      const brandId = Number(brandIdParam);
      const ctx = await this.orgs.setCookie(brandId, cookie);
      if (brandId === SPARK_DEFAULT_BRAND_ID) this.api.updateCookie(cookie);
      this.logger.log(`brand ${brandId} 星火 cookie 已更新（DB + 运行时）`);
      return { ok: true, brand_id: ctx.brandId, persisted: true };
    }
    this.api.updateCookie(cookie);
    const legacy = await this.orgs
      .forBrand(SPARK_DEFAULT_BRAND_ID)
      .catch(() => null);
    if (legacy) {
      await this.orgs.setCookie(SPARK_DEFAULT_BRAND_ID, cookie).catch(() => null);
      return { ok: true, brand_id: SPARK_DEFAULT_BRAND_ID, persisted: true };
    }
    this.logger.log('星火 cookie 已运行时更新（注意：重启后将恢复为 .env 配置）');
    return { ok: true, persisted: false };
  }

  /** 区域汇总：投放数据按账户归属映射至大区/门店（账号名称匹配 KosAccount，未匹配单独归组） */
  async campaignRegion(query: {
    start?: string;
    end?: string;
    brandId?: string;
    scope?: string;
    groupby?: string;
  }) {
    const groupby = ['region', 'store'].includes(query.groupby ?? '')
      ? (query.groupby as string)
      : 'region';
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);
    const brandId = query.brandId ? Number(query.brandId) : SPARK_DEFAULT_BRAND_ID;
    const sellerIds = await this.scopeSellerIds(query.scope);

    const [rows, kos, sparks] = await Promise.all([
      this.prisma.koxCampaignDailyStat.findMany({
        where: {
          statDate: { gte: start, lte: end },
          brandId,
          ...(sellerIds ? { virtualSellerId: { in: sellerIds } } : {}),
        },
      }),
      this.prisma.kosAccount.findMany({
        where: { brandId },
        select: { nickname: true, storeName: true, regionName: true },
      }),
      this.prisma.sparkAccount.findMany({
        select: { virtualSellerId: true, name: true },
      }),
    ]);

    const regionByStore = new Map<string, string>();
    const regionByNick = new Map<string, string>();
    for (const k of kos) {
      if (k.storeName) regionByStore.set(k.storeName, k.regionName ?? '未匹配');
      if (k.nickname) regionByNick.set(k.nickname, k.regionName ?? '未匹配');
    }
    const attrBySeller = new Map<string, { region: string; store: string }>();
    for (const s of sparks) {
      const region = regionByStore.get(s.name) ?? regionByNick.get(s.name) ?? '未匹配';
      attrBySeller.set(s.virtualSellerId, {
        region,
        store: region === '未匹配' ? '未匹配' : s.name,
      });
    }

    type Agg = {
      name: string;
      region: string;
      accountIds: Set<string>;
      fee: number;
      impression: number;
      click: number;
      interaction: number;
      msg_inquiries: number;
      msg_openings: number;
      msg_leads: number;
    };
    const groups = new Map<string, Agg>();
    for (const r of rows) {
      const attr = attrBySeller.get(r.virtualSellerId) ?? {
        region: '未匹配',
        store: '未匹配',
      };
      const key = groupby === 'store' ? `${attr.region}·${attr.store}` : attr.region;
      const cur =
        groups.get(key) ??
        {
          name: groupby === 'store' ? attr.store : attr.region,
          region: attr.region,
          accountIds: new Set<string>(),
          fee: 0,
          impression: 0,
          click: 0,
          interaction: 0,
          msg_inquiries: 0,
          msg_openings: 0,
          msg_leads: 0,
        };
      cur.accountIds.add(r.virtualSellerId);
      cur.fee += Number(r.fee);
      cur.impression += r.impression;
      cur.click += r.click;
      cur.interaction += r.interaction;
      cur.msg_inquiries += r.messageConsult;
      cur.msg_openings += r.msgChatUserCnt;
      cur.msg_leads += r.msgLeadsNum;
      groups.set(key, cur);
    }

    const list = [...groups.values()]
      .map((g) => ({
        name: g.name,
        region: groupby === 'store' ? g.region : undefined,
        account_num: g.accountIds.size,
        fee: Math.round(g.fee * 100) / 100,
        impression: g.impression,
        click: g.click,
        ctr: g.impression ? Math.round((g.click / g.impression) * 10000) / 100 : 0,
        interaction: g.interaction,
        msg_inquiries: g.msg_inquiries,
        msg_openings: g.msg_openings,
        msg_leads: g.msg_leads,
        msg_lead_cost: g.msg_leads ? Math.round((g.fee / g.msg_leads) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.fee - a.fee);

    const totalFee = list.reduce((a, x) => a + x.fee, 0);
    return {
      groupby,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      total: list.length,
      summary: {
        group_num: list.length,
        account_num: new Set(rows.map((r) => r.virtualSellerId)).size,
        fee: Math.round(totalFee * 100) / 100,
        impression: list.reduce((a, x) => a + x.impression, 0),
        click: list.reduce((a, x) => a + x.click, 0),
        msg_leads: list.reduce((a, x) => a + x.msg_leads, 0),
      },
      list,
    };
  }

  /** 项目报表列表：周期 × 关联账户自动聚合投放数据 */
  async projects(query: { brandId?: string; keyword?: string }) {
    const brandId = query.brandId ? Number(query.brandId) : SPARK_DEFAULT_BRAND_ID;
    const projects = await this.prisma.koxCampaignProject.findMany({
      where: {
        brandId,
        ...(query.keyword ? { name: { contains: query.keyword } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { nickname: true, name: true, phone: true } },
        accounts: { select: { virtualSellerId: true } },
      },
    });

    const list = await Promise.all(
      projects.map(async (p) => {
        const sellerIds = p.accounts.map((a) => a.virtualSellerId);
        const start = new Date(p.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(p.endDate);
        end.setHours(23, 59, 59, 999);
        const agg = sellerIds.length
          ? await this.prisma.koxCampaignDailyStat.aggregate({
              where: {
                statDate: { gte: start, lte: end },
                brandId,
                virtualSellerId: { in: sellerIds },
              },
              _sum: {
                fee: true,
                impression: true,
                click: true,
                interaction: true,
                msgLeadsNum: true,
              },
            })
          : null;
        // 星火日聚合缺数时回退旧系统导入的周期累计快照（如特斯拉 uplus 导入）
        let imported: Record<string, unknown> | null = null;
        const hasDaily =
          agg && Number(agg._sum.fee ?? 0) > 0 && Number(agg._sum.impression ?? 0) > 0;
        if (!hasDaily && p.importedStats && typeof p.importedStats === 'object') {
          imported = p.importedStats as Record<string, unknown>;
        }
        const numOr = (v: unknown, fb: number) =>
          typeof v === 'number' && Number.isFinite(v) ? v : fb;
        const fee = hasDaily ? Number(agg!._sum.fee ?? 0) : numOr(imported?.fee, 0);
        const impression = hasDaily
          ? agg!._sum.impression ?? 0
          : numOr(imported?.impression, 0);
        const click = hasDaily ? agg!._sum.click ?? 0 : numOr(imported?.click, 0);
        const msgLeads = hasDaily
          ? agg!._sum.msgLeadsNum ?? 0
          : numOr(imported?.msg_leads, 0);
        const interactionAgg = hasDaily
          ? agg!._sum.interaction ?? 0
          : numOr(imported?.interaction, 0);
        const budget = p.budget != null ? Number(p.budget) : null;
        return {
          id: p.id,
          name: p.name,
          remark: p.remark,
          period: `${p.startDate.toISOString().slice(0, 10)} ~ ${p.endDate.toISOString().slice(0, 10)}`,
          start_date: p.startDate.toISOString().slice(0, 10),
          end_date: p.endDate.toISOString().slice(0, 10),
          account_num: sellerIds.length,
          budget,
          fee: Math.round(fee * 100) / 100,
          budget_rate: budget ? Math.round((fee / budget) * 1000) / 10 : null,
          impression,
          click,
          ctr: impression ? Math.round((click / impression) * 10000) / 100 : 0,
          interaction: interactionAgg,
          msg_leads: msgLeads,
          msg_lead_cost: msgLeads ? Math.round((fee / msgLeads) * 10) / 10 : 0,
          data_source: hasDaily ? 'spark_daily' : imported ? 'imported' : 'none',
          created_by:
            p.createdBy?.nickname ?? p.createdBy?.name ?? p.createdBy?.phone ?? '-',
          created_at: p.createdAt,
        };
      }),
    );

    const totalBudget = list.reduce((a, p) => a + (p.budget ?? 0), 0);
    const totalFee = list.reduce((a, p) => a + p.fee, 0);
    return {
      total: list.length,
      summary: {
        project_num: list.length,
        budget_total: Math.round(totalBudget * 100) / 100,
        fee_total: Math.round(totalFee * 100) / 100,
        budget_rate: totalBudget
          ? Math.round((totalFee / totalBudget) * 1000) / 10
          : 0,
        msg_leads_total: list.reduce((a, p) => a + p.msg_leads, 0),
      },
      list,
    };
  }

  async createProject(
    dto: {
      name?: string;
      startDate?: string;
      endDate?: string;
      budget?: number;
      remark?: string;
      virtualSellerIds?: string[];
    },
    userId: number,
    brandId?: string,
  ) {
    const name = (dto?.name ?? '').trim();
    if (!name) throw new Error('请填写项目名称');
    const start = dto?.startDate ? new Date(dto.startDate) : null;
    const end = dto?.endDate ? new Date(dto.endDate) : null;
    if (!start || Number.isNaN(start.getTime())) throw new Error('请选择项目开始日期');
    if (!end || Number.isNaN(end.getTime())) throw new Error('请选择项目结束日期');
    if (end < start) throw new Error('结束日期不能早于开始日期');
    const ids = [...new Set(dto?.virtualSellerIds ?? [])];
    if (!ids.length) throw new Error('请至少关联一个投放账户');

    const known = await this.prisma.sparkAccount.findMany({
      where: { virtualSellerId: { in: ids } },
      select: { virtualSellerId: true },
    });
    if (known.length !== ids.length) {
      throw new Error(`存在无效的投放账户（${ids.length - known.length} 个不在星火账户列表中）`);
    }

    const project = await this.prisma.koxCampaignProject.create({
      data: {
        name,
        startDate: start,
        endDate: end,
        budget: dto?.budget != null && dto.budget > 0 ? dto.budget : null,
        remark: (dto?.remark ?? '').trim() || null,
        brandId: brandId ? Number(brandId) : SPARK_DEFAULT_BRAND_ID,
        createdById: userId,
        accounts: { create: ids.map((virtualSellerId) => ({ virtualSellerId })) },
      },
    });
    return { id: project.id };
  }

  async deleteProject(id: number) {
    const existing = await this.prisma.koxCampaignProject.findUnique({ where: { id } });
    if (!existing) throw new Error('项目不存在');
    await this.prisma.koxCampaignProject.delete({ where: { id } });
    return { id };
  }
}
