import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccountDto {
  nickname: string;
  platform?: string;
  accountType?: string;
  fans?: number;
  areaName?: string;
  storeName?: string;
  accountTag?: string;
  operatorName?: string;
  operatorMobile?: string;
  authorUrl?: string;
}

export interface AccountManageDto {
  accountType?: string;
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
    keyword?: string;
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

    const [total, rows] = await Promise.all([
      this.prisma.kosAccount.count({ where }),
      this.prisma.kosAccount.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((a) => ({
        id: a.id,
        author_id: a.authorId,
        nickname: a.nickname,
        platform: a.platform,
        account_type: a.accountType,
        fans: a.fans,
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
    };
  }

  async createAccount(dto: AccountDto) {
    const account = await this.prisma.kosAccount.create({
      data: {
        authorId: `kos_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        nickname: dto.nickname,
        platform: dto.platform ?? 'douyin',
        accountType: dto.accountType ?? 'KOS',
        fans: dto.fans ?? 0,
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

  async overview(query: { start?: string; end?: string; platform?: string }) {
    const end = query.end ? new Date(query.end) : new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    const platform = query.platform || 'all';

    const where: Prisma.KoxDailyStatWhereInput = {
      platform,
      statDate: { gte: start, lte: end },
    };
    const [rows, accountAgg] = await Promise.all([
      this.prisma.koxDailyStat.findMany({ where, orderBy: { statDate: 'asc' } }),
      this.prisma.kosAccount.groupBy({
        by: ['accountType'],
        _count: { _all: true },
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

    return {
      store_num: await this.prisma.kosAccount.groupBy({
        by: ['storeName'],
        where: { storeName: { not: null } },
      }).then((g) => g.length),
      kos_num: typeCount('KOS'),
      kob_num: typeCount('KOB'),
      koc_num: typeCount('KOC'),
      publish: {
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
      },
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
      ad: {
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
      },
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
      trend: rows.map((r) => ({
        date: r.statDate.toISOString().slice(0, 10),
        item_cnt: r.itemCnt,
        view_sum: r.viewSum,
        interaction_sum: r.interactionSum,
        total_pm_leads: r.totalPmLeads,
      })),
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
        platform: dto.platform ?? 'douyin',
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
      const region = rec.account.areaName ?? '未知';
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
      const region = rec.account.areaName ?? '未知';
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
      const storeName = clean(r.storeName);

      const data = {
        nickname: storeName ?? authorId,
        accountType: type || 'KOS',
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
