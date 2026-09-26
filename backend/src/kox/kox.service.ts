import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccountDto {
  nickname: string;
  platform?: string;
  accountType?: string;
  fans?: number;
  regionName?: string;
  saleArea?: string;
  areaName?: string;
  storeName?: string;
  accountTag?: string;
  operatorName?: string;
  operatorMobile?: string;
  authorUrl?: string;
}

export interface AccountManageDto {
  accountType?: string;
  regionName?: string;
  saleArea?: string;
  storeName?: string;
  operatorName?: string;
  operatorMobile?: string;
  accountTag?: string;
  status?: string;
}

export interface TaskDto {
  taskTitle: string;
  platform?: string;
  taskAccountType?: string;
  startTime: string;
  endTime: string;
  accountIds?: number[];
}

export interface ImportAccountRow {
  authorId?: string | number;
  accountType?: string;
  regionName?: string;
  saleArea?: string;
  region?: string;
  province?: string;
  city?: string;
  storeName?: string;
  authorUrl?: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class KoxService {
  constructor(private prisma: PrismaService) {}

  async accounts(query: {
    platform?: string;
    accountType?: string;
    status?: string;
    regionName?: string;
    saleArea?: string;
    accountTag?: string;
    createdAtStart?: string;
    createdAtEnd?: string;
    keyword?: string;
    brandId?: string;
    page?: string;
    page_size?: string;
    sort?: string;
    order?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where: Prisma.KosAccountWhereInput = {};
    if (query.platform) where.platform = query.platform;
    if (query.accountType) where.accountType = query.accountType;
    if (query.status) where.status = query.status;
    if (query.regionName) where.regionName = query.regionName;
    if (query.saleArea) where.saleArea = query.saleArea;
    if (query.accountTag) where.accountTag = query.accountTag;
    if (query.brandId) where.brandId = Number(query.brandId);
    if (query.createdAtStart || query.createdAtEnd) {
      where.createdAt = {
        ...(query.createdAtStart ? { gte: new Date(query.createdAtStart) } : {}),
        ...(query.createdAtEnd ? { lte: new Date(query.createdAtEnd) } : {}),
      };
    }
    if (query.keyword) {
      where.OR = [
        { nickname: { contains: query.keyword, mode: 'insensitive' } },
        { storeName: { contains: query.keyword, mode: 'insensitive' } },
        { operatorName: { contains: query.keyword, mode: 'insensitive' } },
        { authorId: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    const SORT_FIELDS = ['id', 'nickname', 'fans', 'storeName', 'createdAt'];
    const sort = SORT_FIELDS.includes(query.sort ?? '') ? query.sort! : 'id';
    const order: Prisma.SortOrder = query.order === 'desc' ? 'desc' : 'asc';

    const [total, rows, regionFacets, tagFacets] = await Promise.all([
      this.prisma.kosAccount.count({ where }),
      this.prisma.kosAccount.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kosAccount.groupBy({ by: ['regionName'], where }).then(
        (g) =>
          g
            .map((x) => x.regionName)
            .filter((x): x is string => !!x)
            .sort((a, b) => a.localeCompare(b, 'zh')),
      ),
      this.prisma.kosAccount.groupBy({ by: ['accountTag'], where }).then(
        (g) =>
          g
            .map((x) => x.accountTag)
            .filter((x): x is string => !!x)
            .sort((a, b) => a.localeCompare(b, 'zh')),
      ),
    ]);
    return {
      list: rows.map((a) => ({
        id: a.id,
        author_id: a.authorId,
        nickname: a.nickname,
        platform: a.platform,
        account_type: a.accountType,
        fans: a.fans,
        region_name: a.regionName,
        sale_area: a.saleArea,
        area_name: a.areaName,
        store_name: a.storeName,
        account_tag: a.accountTag,
        operator_name: a.operatorName,
        operator_mobile: a.operatorMobile,
        author_url: a.authorUrl,
        status: a.status,
        add_time: a.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
      region_facets: regionFacets,
      tag_facets: tagFacets,
    };
  }

  async createAccount(dto: AccountDto) {
    const account = await this.prisma.kosAccount.create({
      data: {
        authorId: `kos_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        nickname: dto.nickname,
        platform: dto.platform ?? 'xhs',
        accountType: dto.accountType ?? 'KOS',
        fans: dto.fans ?? 0,
        regionName: dto.regionName,
        saleArea: dto.saleArea,
        areaName: dto.areaName,
        storeName: dto.storeName,
        accountTag: dto.accountTag,
        operatorName: dto.operatorName,
        operatorMobile: dto.operatorMobile,
        authorUrl: dto.authorUrl,
      },
    });
    return { id: account.id };
  }

  async updateAccount(id: number, dto: AccountManageDto) {
    const account = await this.prisma.kosAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('账号不存在');
    await this.prisma.kosAccount.update({
      where: { id },
      data: {
        ...(dto.accountType !== undefined ? { accountType: dto.accountType } : {}),
        ...(dto.regionName !== undefined ? { regionName: dto.regionName } : {}),
        ...(dto.saleArea !== undefined ? { saleArea: dto.saleArea } : {}),
        ...(dto.storeName !== undefined ? { storeName: dto.storeName } : {}),
        ...(dto.operatorName !== undefined ? { operatorName: dto.operatorName } : {}),
        ...(dto.operatorMobile !== undefined ? { operatorMobile: dto.operatorMobile } : {}),
        ...(dto.accountTag !== undefined ? { accountTag: dto.accountTag } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return { id };
  }

  async deleteAccount(id: number) {
    await this.prisma.kosAccount.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('账号不存在');
    });
    return { id };
  }

  async overview(query: {
    start?: string;
    end?: string;
    platform?: string;
    brandId?: string;
  }) {
    const end = query.end ? new Date(query.end) : new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    const platform = query.platform || 'all';
    const brandId = query.brandId ? Number(query.brandId) : undefined;

    const where: Prisma.KoxDailyStatWhereInput = {
      platform,
      statDate: { gte: start, lte: end },
      ...(brandId !== undefined ? { brandId } : {}),
    };
    const accountWhere: Prisma.KosAccountWhereInput = brandId
      ? { brandId }
      : {};
    const campaignWhere: Prisma.KoxCampaignDailyStatWhereInput = {
      statDate: { gte: start, lte: end },
      ...(brandId ? { brandId } : {}),
    };
    const noteWhere: Prisma.KoxNoteWhereInput = {
      publishTime: { gte: start, lte: end },
      ...(brandId ? { brandId } : {}),
    };
    const [rows, accountAgg, campaignRows, noteRows] = await Promise.all([
      this.prisma.koxDailyStat.findMany({ where, orderBy: { statDate: 'asc' } }),
      this.prisma.kosAccount.groupBy({
        by: ['accountType'],
        where: accountWhere,
        _count: { _all: true },
      }),
      this.prisma.koxCampaignDailyStat.findMany({
        where: campaignWhere,
        orderBy: { statDate: 'asc' },
      }),
      this.prisma.koxNote.findMany({
        where: noteWhere,
        select: {
          authorName: true,
          views: true,
          exposure: true,
          likes: true,
          comments: true,
          shares: true,
          collects: true,
          followCount: true,
          publishTime: true,
        },
      }),
    ]);

    const sum = (f: (r: (typeof rows)[number]) => number) =>
      rows.reduce((acc, r) => acc + f(r), 0);

    const itemCnt = sum((r) => r.itemCnt);
    const interactionSum = sum((r) => r.interactionSum);
    const viewSum = sum((r) => r.viewSum);
    const exposureSum = sum((r) => r.exposureSum);
    const authorNum = rows.length ? rows[rows.length - 1].authorNum : 0;
    const adCost = sum((r) => num(r.adCost));
    const adViewSum = sum((r) => r.adViewSum);
    const adConversions = sum((r) => r.adConversions);
    const liveTotalLeads = sum((r) => r.liveTotalLeads);
    const liveWatchUv = sum((r) => r.liveWatchUv);
    const liveToolClickCnt = sum((r) => r.liveToolClickCnt);
    const liveCost = sum((r) => num(r.liveCost));
    const liveCount = sum((r) => r.liveCount);

    const typeCount = (t: string) =>
      accountAgg.find((g) => g.accountType === t)?._count._all ?? 0;

    const r2 = (v: number) => Math.round(v * 100) / 100;

    // 发布区块：星火笔记明细（KoxNote）优先，无数据时回退 KoxDailyStat
    const noteAuthors = new Set(
      noteRows.map((n) => n.authorName).filter((a): a is string => !!a),
    );
    const noteSum = (f: (n: (typeof noteRows)[number]) => number) =>
      noteRows.reduce((acc, n) => acc + f(n), 0);
    const noteViewSum = noteSum((n) => n.views);
    const noteExposureSum = noteSum((n) => n.exposure);
    const noteInteractionSum = noteSum(
      (n) => n.likes + n.comments + n.shares + n.collects,
    );
    const hasNotes = noteRows.length > 0;

    const publish = hasNotes
      ? {
          author_num: noteAuthors.size,
          item_cnt: noteRows.length,
          crazy_item_cnt: noteRows.filter((n) => n.views >= 10000).length,
          item_author_ratio: noteAuthors.size
            ? r2(noteRows.length / noteAuthors.size)
            : 0,
          follow_count_sum: noteSum((n) => n.followCount),
          exposure_sum: noteExposureSum,
          view_sum: noteViewSum,
          interaction_sum: noteInteractionSum,
          interaction_rate: noteViewSum
            ? r2((noteInteractionSum / noteViewSum) * 100)
            : 0,
          tool_item_cnt_sum: 0,
        }
      : {
          author_num: authorNum,
          item_cnt: itemCnt,
          crazy_item_cnt: sum((r) => r.crazyItemCnt),
          item_author_ratio: authorNum ? r2(itemCnt / authorNum) : 0,
          follow_count_sum: sum((r) => r.followCountSum),
          exposure_sum: exposureSum,
          view_sum: viewSum,
          interaction_sum: interactionSum,
          interaction_rate: viewSum ? r2((interactionSum / viewSum) * 100) : 0,
          tool_item_cnt_sum: sum((r) => r.toolItemCntSum),
        };

    // 广告区块：星火投放真实数据（KoxCampaignDailyStat）优先，无数据时回退 KoxDailyStat
    const campaignFee = campaignRows.reduce((acc, r) => acc + Number(r.fee), 0);
    const campaignImp = campaignRows.reduce((acc, r) => acc + r.impression, 0);
    const campaignClick = campaignRows.reduce((acc, r) => acc + r.click, 0);
    const hasCampaign = campaignRows.length > 0;

    const ad = hasCampaign
      ? {
          ad_cost: r2(campaignFee),
          ad_view_sum: campaignImp,
          ad_ctr: campaignImp ? r2((campaignClick / campaignImp) * 100) : 0,
          ad_cpc: campaignClick ? r2(campaignFee / campaignClick) : 0,
          ad_cpm: campaignImp ? r2((campaignFee / campaignImp) * 1000) : 0,
          ad_conversions: campaignClick,
          ad_conversion_cost: campaignClick ? r2(campaignFee / campaignClick) : 0,
          ad_conversion_rate: campaignImp
            ? r2((campaignClick / campaignImp) * 100)
            : 0,
        }
      : {
          ad_cost: r2(adCost),
          ad_view_sum: adViewSum,
          ad_ctr: adViewSum ? r2((adConversions / adViewSum) * 1000) / 10 : 0,
          ad_cpc: adConversions ? r2(adCost / adConversions) : 0,
          ad_cpm: adViewSum ? r2((adCost / adViewSum) * 1000) : 0,
          ad_conversions: adConversions,
          ad_conversion_cost: adConversions ? r2(adCost / adConversions) : 0,
          ad_conversion_rate: adViewSum
            ? r2((adConversions / adViewSum) * 10000) / 100
            : 0,
        };

    return {
      store_num: await this.prisma.kosAccount.groupBy({
        by: ['storeName'],
        where: { storeName: { not: null }, ...accountWhere },
      }).then((g) => g.length),
      kos_num: typeCount('KOS'),
      kob_num: typeCount('KOB'),
      koc_num: typeCount('KOC'),
      publish,
      publish_source: hasNotes ? 'spark_notes' : 'kox_daily_stat',
      lead: {
        total_pm_inquiries_sum: sum((r) => r.totalPmInquiries),
        total_pm_openings_sum: sum((r) => r.totalPmOpenings),
        total_pm_leads_sum: sum((r) => r.totalPmLeads),
        tool_click_cnt_sum: sum((r) => r.toolClickCnt),
        form_leads_sum: sum((r) => r.formLeads),
        lead_rate: viewSum
          ? r2((sum((r) => r.totalPmLeads) / viewSum) * 10000) / 100
          : 0,
      },
      ad,
      live: {
        live_account_num: rows.length
          ? rows[rows.length - 1].liveAccountNum
          : 0,
        live_count: liveCount,
        live_valid_duration: sum((r) => r.liveValidDuration),
        live_exposure_uv: sum((r) => r.liveExposureUv),
        live_watch_uv: liveWatchUv,
        live_tool_click_cnt: liveToolClickCnt,
        live_total_leads: liveTotalLeads,
        live_form_leads: sum((r) => r.liveFormLeads),
        live_lead_rate: liveWatchUv
          ? r2((liveTotalLeads / liveWatchUv) * 10000) / 100
          : 0,
        live_tool_click_rate: liveWatchUv
          ? r2((liveToolClickCnt / liveWatchUv) * 10000) / 100
          : 0,
        live_cost: r2(liveCost),
        live_conversion_cost: liveTotalLeads ? r2(liveCost / liveTotalLeads) : 0,
      },
      ad_source: hasCampaign ? 'spark_campaign' : 'kox_daily_stat',
      trend: (() => {
        const campByDate = new Map<
          string,
          { fee: number; impression: number; click: number; msg_leads: number }
        >();
        for (const c of campaignRows) {
          const key = c.statDate.toISOString().slice(0, 10);
          const cur =
            campByDate.get(key) ?? { fee: 0, impression: 0, click: 0, msg_leads: 0 };
          cur.fee += Number(c.fee);
          cur.impression += c.impression;
          cur.click += c.click;
          cur.msg_leads += c.msgLeadsNum;
          campByDate.set(key, cur);
        }
        const noteByDate = new Map<
          string,
          { item_cnt: number; view_sum: number; interaction_sum: number }
        >();
        for (const n of noteRows) {
          if (!n.publishTime) continue;
          const key = n.publishTime.toISOString().slice(0, 10);
          const cur =
            noteByDate.get(key) ?? { item_cnt: 0, view_sum: 0, interaction_sum: 0 };
          cur.item_cnt += 1;
          cur.view_sum += n.views;
          cur.interaction_sum += n.likes + n.comments + n.shares + n.collects;
          noteByDate.set(key, cur);
        }
        const byDate = new Map<
          string,
          {
            item_cnt: number;
            view_sum: number;
            interaction_sum: number;
            total_pm_leads: number;
            ad_cost: number;
            ad_impression: number;
            ad_click: number;
            ad_msg_leads: number;
          }
        >();
        for (const r of rows) {
          const key = r.statDate.toISOString().slice(0, 10);
          const camp = campByDate.get(key);
          byDate.set(key, {
            item_cnt: r.itemCnt,
            view_sum: r.viewSum,
            interaction_sum: r.interactionSum,
            total_pm_leads: r.totalPmLeads,
            ad_cost: r2(camp?.fee ?? 0),
            ad_impression: camp?.impression ?? 0,
            ad_click: camp?.click ?? 0,
            ad_msg_leads: camp?.msg_leads ?? 0,
          });
        }
        for (const [key, v] of noteByDate) {
          if (!byDate.has(key)) {
            const camp = campByDate.get(key);
            byDate.set(key, {
              item_cnt: v.item_cnt,
              view_sum: v.view_sum,
              interaction_sum: v.interaction_sum,
              total_pm_leads: 0,
              ad_cost: r2(camp?.fee ?? 0),
              ad_impression: camp?.impression ?? 0,
              ad_click: camp?.click ?? 0,
              ad_msg_leads: camp?.msg_leads ?? 0,
            });
          }
        }
        for (const [key, camp] of campByDate) {
          if (!byDate.has(key)) {
            byDate.set(key, {
              item_cnt: 0,
              view_sum: 0,
              interaction_sum: 0,
              total_pm_leads: 0,
              ad_cost: r2(camp.fee),
              ad_impression: camp.impression,
              ad_click: camp.click,
              ad_msg_leads: camp.msg_leads,
            });
          }
        }
        return [...byDate.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, v]) => ({ date, ...v }));
      })(),
    };
  }

  async tasks(query: { page?: string; page_size?: string; status?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.page_size ?? 20) || 20);
    const where: Prisma.KoxTaskWhereInput = {};
    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.koxTask.count({ where }),
      this.prisma.koxTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          authors: { select: { id: true, finished: true } },
          createdBy: { select: { nickname: true, name: true, phone: true } },
        },
      }),
    ]);

    return {
      list: rows.map((t) => ({
        id: t.id,
        task_title: t.taskTitle,
        platform: t.platform,
        task_account_type: t.taskAccountType,
        start_time: t.startTime,
        end_time: t.endTime,
        time_range: `${t.startTime.toISOString().slice(0, 10)} ~ ${t.endTime.toISOString().slice(0, 10)}`,
        status: t.status,
        created_user: t.createdBy?.nickname ?? t.createdBy?.name ?? t.createdBy?.phone ?? '-',
        author_count: t.authors.length,
        finished_count: t.authors.filter((a) => a.finished).length,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async createTask(dto: TaskDto, userId: number) {
    if (!dto.taskTitle?.trim()) throw new BadRequestException('请填写任务名称');
    const task = await this.prisma.koxTask.create({
      data: {
        taskTitle: dto.taskTitle,
        platform: dto.platform ?? 'xhs',
        taskAccountType: dto.taskAccountType ?? 'KOS',
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        status: 'ongoing',
        createdById: userId,
        ...(dto.accountIds?.length
          ? {
              authors: {
                create: dto.accountIds.map((id) => ({ accountId: id })),
              },
            }
          : {}),
      },
    });
    return { id: task.id };
  }

  async taskDetail(id: number) {
    const task = await this.prisma.koxTask.findUnique({
      where: { id },
      include: {
        authors: {
          include: {
            account: {
              select: {
                nickname: true,
                accountType: true,
                regionName: true,
                areaName: true,
                storeName: true,
              },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');

    const regionMap = new Map<
      string,
      {
        saas_company_num: number;
        task_author_num: number;
        finish: number;
        valid: number;
        ces: number;
        view: number;
        display: number;
        violation: number;
      }
    >();
    for (const rec of task.authors) {
      const region = rec.account.regionName ?? rec.account.areaName ?? '未知';
      const cur =
        regionMap.get(region) ??
        {
          saas_company_num: 0,
          task_author_num: 0,
          finish: 0,
          valid: 0,
          ces: 0,
          view: 0,
          display: 0,
          violation: 0,
        };
      cur.task_author_num += 1;
      if (rec.finished) cur.finish += 1;
      cur.valid += rec.validItemCount;
      cur.ces += rec.ces;
      cur.view += rec.viewCount;
      cur.display += rec.displayCount;
      cur.violation += rec.violationCount;
      regionMap.set(region, cur);
    }
    const dealerSet = new Map<string, Set<string>>();
    for (const rec of task.authors) {
      const region = rec.account.regionName ?? rec.account.areaName ?? '未知';
      const dealer = rec.account.storeName ?? '未知';
      if (!dealerSet.has(region)) dealerSet.set(region, new Set());
      dealerSet.get(region)!.add(dealer);
    }

    const region_ranking = [...regionMap.entries()]
      .map(([region, v]) => ({
        region,
        saas_company_num: dealerSet.get(region)?.size ?? 0,
        task_author_num: v.task_author_num,
        task_finish_author_num: v.finish,
        task_finish_rate: v.task_author_num
          ? Math.round((v.finish / v.task_author_num) * 100)
          : 0,
        task_valid_item_num: v.valid,
        task_ces: v.ces,
        task_view_all: v.view,
        task_display_all: v.display,
        task_violation_item_num: v.violation,
      }))
      .sort((a, b) => b.task_ces - a.task_ces);

    const author_ranking = task.authors
      .map((rec, i) => ({
        rank: i + 1,
        nickname: rec.account.nickname,
        account_type: rec.account.accountType,
        store_name: rec.account.storeName,
        progress: rec.finished ? 100 : Math.min(99, rec.validItemCount * 20),
        finished: rec.finished,
        valid_item_count: rec.validItemCount,
        task_interaction: rec.interaction,
        task_view: rec.viewCount,
        task_ces: rec.ces,
      }))
      .sort((a, b) => b.task_ces - a.task_ces)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      id: task.id,
      task_title: task.taskTitle,
      platform: task.platform,
      task_account_type: task.taskAccountType,
      start_time: task.startTime,
      end_time: task.endTime,
      status: task.status,
      author_count: task.authors.length,
      region_ranking,
      author_ranking,
    };
  }

  async stopTask(id: number) {
    const task = await this.prisma.koxTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'ongoing') throw new BadRequestException('任务已结束');
    await this.prisma.koxTask.update({
      where: { id },
      data: { status: 'stopped' },
    });
    return { id, status: 'stopped' };
  }

  async modelSales(query: { month?: string }) {
    const month =
      query.month ?? new Date().toISOString().slice(0, 7);
    const rows = await this.prisma.koxDealerSales.findMany({
      where: { month },
      orderBy: [{ totalSales: 'desc' }],
    });
    const months = await this.prisma.koxDealerSales.groupBy({
      by: ['month'],
      _sum: { totalSales: true, leadsCount: true },
    });
    return {
      month,
      list: rows.map((r, i) => ({
        rank: i + 1,
        dealer_name: r.dealerName,
        model_name: r.modelName,
        total_sales: r.totalSales,
        leads_count: r.leadsCount,
      })),
      months: months
        .map((m) => ({
          month: m.month,
          total_sales: m._sum.totalSales ?? 0,
          leads_count: m._sum.leadsCount ?? 0,
        }))
        .sort((a, b) => b.month.localeCompare(a.month)),
    };
  }

  async ranking(query: {
    dimension?: string;
    start?: string;
    end?: string;
    accountType?: string;
    platform?: string;
    brandId?: string;
    metric?: string;
    page?: string;
    page_size?: string;
  }) {
    const DIMENSIONS = ['region', 'saleArea', 'store', 'account', 'tag'];
    const dimension = DIMENSIONS.includes(query.dimension ?? '')
      ? query.dimension!
      : 'region';
    const METRICS = [
      'item_cnt',
      'exposure_sum',
      'view_sum',
      'interaction_sum',
      'digg_sum',
      'follow_sum',
      'pm_leads',
    ] as const;
    type MetricKey = (typeof METRICS)[number];
    const metric: MetricKey = (METRICS as readonly string[]).includes(
      query.metric ?? '',
    )
      ? (query.metric as MetricKey)
      : 'view_sum';

    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    start.setHours(0, 0, 0, 0);
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    );
    const prevEnd = new Date(start.getTime() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
    prevStart.setHours(0, 0, 0, 0);

    const accountWhere: Prisma.KosAccountWhereInput = {};
    if (query.accountType) accountWhere.accountType = query.accountType;
    if (query.platform) accountWhere.platform = query.platform;
    if (query.brandId) accountWhere.brandId = Number(query.brandId);

    const [curRows, prevRows] = await Promise.all([
      this.prisma.koxAccountDailyStat.findMany({
        where: { statDate: { gte: start, lte: end }, account: accountWhere },
        include: {
          account: {
            select: {
              id: true,
              authorId: true,
              nickname: true,
              accountType: true,
              regionName: true,
              saleArea: true,
              areaName: true,
              storeName: true,
              accountTag: true,
            },
          },
        },
      }),
      this.prisma.koxAccountDailyStat.findMany({
        where: {
          statDate: { gte: prevStart, lte: prevEnd },
          account: accountWhere,
        },
        include: {
          account: {
            select: {
              id: true,
              nickname: true,
              regionName: true,
              saleArea: true,
              areaName: true,
              storeName: true,
              accountTag: true,
            },
          },
        },
      }),
    ]);

    const dimOf = (a: {
      nickname: string;
      regionName: string | null;
      saleArea: string | null;
      areaName: string | null;
      storeName: string | null;
      accountTag?: string | null;
    }): string => {
      switch (dimension) {
        case 'saleArea':
          return a.saleArea ?? a.areaName ?? '未知区域';
        case 'store':
          return a.storeName ?? '未知店铺';
        case 'account':
          return a.nickname;
        case 'tag':
          return a.accountTag ?? '未标签';
        default:
          return a.regionName ?? a.areaName ?? '未知大区';
      }
    };

    type Agg = {
      name: string;
      accountIds: Set<number>;
      storeNames: Set<string>;
      item_cnt: number;
      exposure_sum: number;
      view_sum: number;
      interaction_sum: number;
      digg_sum: number;
      follow_sum: number;
      pm_leads: number;
    };
    const newAgg = (name: string): Agg => ({
      name,
      accountIds: new Set(),
      storeNames: new Set(),
      item_cnt: 0,
      exposure_sum: 0,
      view_sum: 0,
      interaction_sum: 0,
      digg_sum: 0,
      follow_sum: 0,
      pm_leads: 0,
    });
    const addRow = (
      map: Map<string, Agg>,
      account: {
        id: number;
        nickname: string;
        regionName: string | null;
        saleArea: string | null;
        areaName: string | null;
        storeName: string | null;
        accountTag?: string | null;
      },
      s: {
        itemCnt: number;
        exposureSum: number;
        viewSum: number;
        interactionSum: number;
        diggSum: number;
        followCountSum: number;
        pmLeads: number;
      },
    ) => {
      const key = dimOf(account);
      const agg = map.get(key) ?? newAgg(key);
      agg.accountIds.add(account.id);
      if (account.storeName) agg.storeNames.add(account.storeName);
      agg.item_cnt += s.itemCnt;
      agg.exposure_sum += s.exposureSum;
      agg.view_sum += s.viewSum;
      agg.interaction_sum += s.interactionSum;
      agg.digg_sum += s.diggSum;
      agg.follow_sum += s.followCountSum;
      agg.pm_leads += s.pmLeads;
      map.set(key, agg);
    };

    const curMap = new Map<string, Agg>();
    for (const r of curRows) addRow(curMap, r.account, r);
    const prevMap = new Map<string, Agg>();
    for (const r of prevRows) addRow(prevMap, r.account, r);

    // 笔记累计回退：无日统计（如特斯拉旧数据导入区）时用 KoxNote 累计口径聚合
    let metricSource: 'daily' | 'notes_cumulative' = 'daily';
    let fallbackAccounts: {
      id: number;
      nickname: string;
      regionName: string | null;
      saleArea: string | null;
      areaName: string | null;
      storeName: string | null;
      accountTag: string | null;
      authorId: string;
      accountType: string;
    }[] = [];
    if (!curRows.length && query.brandId) {
      const brandIdNum = Number(query.brandId);
      const noteCount = await this.prisma.koxNote.count({ where: { brandId: brandIdNum } });
      if (noteCount > 0) {
        metricSource = 'notes_cumulative';
        const accounts = await this.prisma.kosAccount.findMany({
          where: { brandId: brandIdNum },
          select: {
            id: true,
            nickname: true,
            regionName: true,
            saleArea: true,
            areaName: true,
            storeName: true,
            accountTag: true,
            authorId: true,
            accountType: true,
          },
        });
        fallbackAccounts = accounts;
        const acctByNickname = new Map(accounts.map((a) => [a.nickname, a]));
        const notes = await this.prisma.koxNote.findMany({
          where: { brandId: brandIdNum },
          select: {
            accountId: true,
            authorName: true,
            exposure: true,
            views: true,
            likes: true,
            collects: true,
            comments: true,
            shares: true,
            followCount: true,
            pmLeads: true,
          },
        });
        const acctById = new Map(accounts.map((a) => [a.id, a]));
        for (const n of notes) {
          const acct =
            (n.accountId != null ? acctById.get(n.accountId) : undefined) ??
            (n.authorName ? acctByNickname.get(n.authorName) : undefined);
          if (!acct) continue;
          const key = dimOf(acct);
          const g = curMap.get(key) ?? newAgg(key);
          g.accountIds.add(acct.id);
          if (acct.storeName) g.storeNames.add(acct.storeName);
          g.item_cnt += 1;
          g.exposure_sum += n.exposure;
          g.view_sum += n.views;
          g.interaction_sum += n.likes + n.collects + n.comments + n.shares;
          g.digg_sum += n.likes;
          g.follow_sum += n.followCount;
          g.pm_leads += n.pmLeads;
          curMap.set(key, g);
        }
      }
    }

    const accountInfo = new Map<
      string,
      {
        author_id: string;
        account_type: string;
        store_name: string | null;
        region_name: string | null;
        sale_area: string | null;
      }
    >();
    if (dimension === 'account') {
      for (const r of curRows) {
        accountInfo.set(r.account.nickname, {
          author_id: r.account.authorId,
          account_type: r.account.accountType,
          store_name: r.account.storeName,
          region_name: r.account.regionName,
          sale_area: r.account.saleArea,
        });
      }
      for (const a of fallbackAccounts) {
        if (!accountInfo.has(a.nickname)) {
          accountInfo.set(a.nickname, {
            author_id: a.authorId,
            account_type: a.accountType,
            store_name: a.storeName,
            region_name: a.regionName,
            sale_area: a.saleArea,
          });
        }
      }
    }

    const growth = (cur: number, prev: number): number | null => {
      if (!prev) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    };

    const groups = [...curMap.values()]
      .map((g) => {
        const prev = prevMap.get(g.name);
        const base = {
          name: g.name,
          account_num: g.accountIds.size,
          store_num: g.storeNames.size,
          item_cnt: g.item_cnt,
          exposure_sum: g.exposure_sum,
          view_sum: g.view_sum,
          interaction_sum: g.interaction_sum,
          digg_sum: g.digg_sum,
          follow_sum: g.follow_sum,
          pm_leads: g.pm_leads,
          growth: growth(g[metric], prev ? prev[metric] : 0),
          ...(dimension === 'account' ? accountInfo.get(g.name) ?? {} : {}),
        };
        return base;
      })
      .sort((a, b) => (b[metric] as number) - (a[metric] as number));

    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 20) || 20));

    const summary = groups.reduce(
      (acc, g) => ({
        account_num: acc.account_num + g.account_num,
        item_cnt: acc.item_cnt + g.item_cnt,
        exposure_sum: acc.exposure_sum + g.exposure_sum,
        view_sum: acc.view_sum + g.view_sum,
        interaction_sum: acc.interaction_sum + g.interaction_sum,
        pm_leads: acc.pm_leads + g.pm_leads,
      }),
      {
        account_num: 0,
        item_cnt: 0,
        exposure_sum: 0,
        view_sum: 0,
        interaction_sum: 0,
        pm_leads: 0,
      },
    );
    const accountTotal = new Set(
      curRows.map((r) => r.account.id),
    ).size;

    return {
      dimension,
      metric,
      metric_source: metricSource,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      summary: { ...summary, account_num: accountTotal, group_num: groups.length },
      list: groups
        .slice((page - 1) * pageSize, page * pageSize)
        .map((g, i) => ({ rank: (page - 1) * pageSize + i + 1, ...g })),
      total: groups.length,
      page,
      page_size: pageSize,
    };
  }

  private noteFilters(query: {
    brandId?: string;
    start?: string;
    end?: string;
    noteType?: string;
    category?: string;
    modelTag?: string;
    keyword?: string;
    author?: string;
    isRtbAdver?: string;
  }): { where: Prisma.KoxNoteWhereInput; base: Prisma.KoxNoteWhereInput; start: Date; end: Date } {
    const end = query.end ? new Date(query.end) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    start.setHours(0, 0, 0, 0);

    const base: Prisma.KoxNoteWhereInput = {
      publishTime: { gte: start, lte: end },
      ...(query.brandId ? { brandId: Number(query.brandId) } : {}),
    };
    const where: Prisma.KoxNoteWhereInput = { ...base };
    if (query.noteType) where.noteType = query.noteType;
    if (query.category) where.category = query.category;
    if (query.modelTag) where.modelTag = query.modelTag;
    if (query.isRtbAdver === 'true' || query.isRtbAdver === 'false') {
      where.isRtbAdver = query.isRtbAdver === 'true';
    }
    if (query.keyword)
      where.title = { contains: query.keyword, mode: 'insensitive' };
    if (query.author)
      where.OR = [
        { authorName: { contains: query.author, mode: 'insensitive' } },
        { account: { nickname: { contains: query.author, mode: 'insensitive' } } },
      ];
    return { where, base, start, end };
  }

  async notes(query: {
    brandId?: string;
    start?: string;
    end?: string;
    noteType?: string;
    category?: string;
    modelTag?: string;
    keyword?: string;
    author?: string;
    isRtbAdver?: string;
    metric?: string;
    page?: string;
    page_size?: string;
  }) {
    const { where, base } = this.noteFilters(query);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(query.page_size ?? 20) || 20));

    const METRICS: Record<string, Prisma.KoxNoteOrderByWithRelationInput> = {
      views: { views: 'desc' },
      likes: { likes: 'desc' },
      comments: { comments: 'desc' },
      shares: { shares: 'desc' },
      collects: { collects: 'desc' },
      exposure: { exposure: 'desc' },
      formLeads: { formLeads: 'desc' },
      pmLeads: { pmLeads: 'desc' },
      publishTime: { publishTime: 'desc' },
    };
    const orderBy = METRICS[query.metric ?? ''] ?? METRICS.views;

    const [total, rows, categoryFacets, modelFacets] = await Promise.all([
      this.prisma.koxNote.count({ where }),
      this.prisma.koxNote.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          account: {
            select: { nickname: true, accountType: true, storeName: true },
          },
        },
      }),
      this.prisma.koxNote.groupBy({ by: ['category'], where: base }),
      this.prisma.koxNote.groupBy({ by: ['modelTag'], where: base }),
    ]);

    return {
      list: rows.map((n) => ({
        id: n.id,
        note_id: n.noteId,
        note_type: n.noteType,
        title: n.title,
        content: n.content,
        cover_url: n.coverUrl,
        note_url: n.noteUrl,
        publish_time: n.publishTime,
        author_name: n.account?.nickname ?? n.authorName ?? '-',
        account_type: n.account?.accountType ?? n.accountType ?? 'KOS',
        store_name: n.account?.storeName ?? null,
        category: n.category,
        model_tag: n.modelTag,
        exposure: n.exposure,
        views: n.views,
        likes: n.likes,
        collects: n.collects,
        comments: n.comments,
        shares: n.shares,
        follow_count: n.followCount,
        pm_inquiries: n.pmInquiries,
        pm_openings: n.pmOpenings,
        pm_leads: n.pmLeads,
        form_leads: n.formLeads,
      })),
      total,
      page,
      page_size: pageSize,
      category_facets: categoryFacets
        .map((g) => g.category)
        .filter((c): c is string => !!c),
      model_facets: modelFacets
        .map((g) => g.modelTag)
        .filter((m): m is string => !!m),
    };
  }

  async notesSummary(query: {
    brandId?: string;
    start?: string;
    end?: string;
    noteType?: string;
    category?: string;
    modelTag?: string;
    keyword?: string;
    author?: string;
  }) {
    const { where } = this.noteFilters(query);
    const rows = await this.prisma.koxNote.findMany({
      where,
      select: {
        likes: true,
        comments: true,
        formLeads: true,
        followCount: true,
        views: true,
        exposure: true,
        pmInquiries: true,
        pmOpenings: true,
        pmLeads: true,
        category: true,
        modelTag: true,
        keyword: true,
      },
    });

    const totals = rows.reduce(
      (acc, n) => ({
        note_cnt: acc.note_cnt + 1,
        interaction_sum: acc.interaction_sum + n.likes + n.comments,
        follow_sum: acc.follow_sum + n.followCount,
        view_sum: acc.view_sum + n.views,
        exposure_sum: acc.exposure_sum + n.exposure,
        pm_inquiries_sum: acc.pm_inquiries_sum + n.pmInquiries,
        pm_openings_sum: acc.pm_openings_sum + n.pmOpenings,
        pm_leads_sum: acc.pm_leads_sum + n.pmLeads,
      }),
      {
        note_cnt: 0,
        interaction_sum: 0,
        follow_sum: 0,
        view_sum: 0,
        exposure_sum: 0,
        pm_inquiries_sum: 0,
        pm_openings_sum: 0,
        pm_leads_sum: 0,
      },
    );

    const byCategory = new Map<string, { inter: number; leads: number }>();
    const byModel = new Map<string, number>();
    const kwFreq = new Map<string, number>();
    for (const n of rows) {
      const cat = n.category ?? '未分类';
      const cur = byCategory.get(cat) ?? { inter: 0, leads: 0 };
      cur.inter += n.likes + n.comments;
      cur.leads += n.formLeads;
      byCategory.set(cat, cur);

      const model = n.modelTag ?? '未提及';
      byModel.set(model, (byModel.get(model) ?? 0) + 1);

      const kw = n.keyword ?? n.modelTag ?? n.category;
      if (kw) kwFreq.set(kw, (kwFreq.get(kw) ?? 0) + 1);
    }

    return {
      totals,
      type_efficiency: [...byCategory.entries()].map(([category, v]) => ({
        category,
        inter: v.inter,
        leads: v.leads,
      })),
      model_distribution: [...byModel.entries()]
        .map(([model, cnt]) => ({ model, cnt }))
        .sort((a, b) => b.cnt - a.cnt),
      keywords: [...kwFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 42)
        .map(([text, count]) => ({ text, count })),
    };
  }

  async importAccounts(rows: ImportAccountRow[]) {
    let added = 0;
    let updated = 0;
    const errors: { row: number; msg: string }[] = [];
    const seen = new Set<string>();

    const clean = (v?: unknown) => {
      const s = (v ?? '').toString().trim();
      return s && s !== '无' ? s : null;
    };

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const authorId = (r.authorId ?? '').toString().trim();
      const rowNo = i + 2;
      if (!authorId) {
        errors.push({ row: rowNo, msg: '缺少账号UID' });
        continue;
      }
      if (seen.has(authorId)) {
        errors.push({ row: rowNo, msg: '文件内UID重复，已跳过' });
        continue;
      }
      seen.add(authorId);

      const type = (r.accountType ?? '').toString().trim().toUpperCase();
      if (type && !['KOS', 'KOB', 'KOC'].includes(type)) {
        errors.push({ row: rowNo, msg: `账号类型非法：${type}` });
        continue;
      }

      const area =
        [clean(r.region), clean(r.province), clean(r.city)]
          .filter(Boolean)
          .join('·') || null;
      const regionName = clean(r.regionName) ?? clean(r.region);
      const saleArea = clean(r.saleArea);
      const storeName = clean(r.storeName);

      const data = {
        nickname: storeName ?? authorId,
        accountType: type || 'KOS',
        regionName,
        saleArea,
        areaName: area,
        storeName,
        authorUrl: (r.authorUrl ?? '').toString().trim() || null,
        platform: 'xhs',
      };

      const existing = await this.prisma.kosAccount.findUnique({
        where: { authorId },
      });
      if (existing) {
        await this.prisma.kosAccount.update({ where: { authorId }, data });
        updated += 1;
      } else {
        await this.prisma.kosAccount.create({
          data: { authorId, ...data },
        });
        added += 1;
      }
    }

    return { total: rows.length, added, updated, errors };
  }
}
