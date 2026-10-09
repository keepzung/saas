const dayKey08 = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);

// 词云停用词：虚词/泛词（特斯拉在品牌工作区内全篇出现，无区分度；model 裸词由车型原子化处理）
const NOTES_WC_STOPWORDS = new Set(
  [
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '都', '一', '上', '也', '很', '到', '说',
    '要', '进', '去', '你', '们', '这', '那', '吗', '什么', '没', '还', '自己', '我们', '觉得',
    '然后', '可以', '这个', '那个', '就是', '一个', '已经', '现在', '直接', '怎么', '这么', '那么',
    '出来', '起来', '如果', '因为', '所以', '但是', '大家', '好的', '谢谢', '需要', '时间', '问题',
    '今天', '明天', '昨天', '以及', '还是', '不是', '一下', '一般', '真的', '好多', '多少', '其他',
    '特斯拉', 'model', '中国', '请问', '回复', '知道', '希望', '喜欢', '支持', '体验', '分享',
    '没有', '还有', '哪里', '什么时候', '怎么样', '怎么样了',
  ].filter((w) => w.length >= 1),
);

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calcCes, classifyTier, KOS_TIERS, KosTierMeta } from './kos-tier.service';
import { extractKeywords } from '../common/text-keywords';
import { ProMatrixService, ProMatrixResult, PRO_STAFF_DAY_DATE_TYPE } from '../pro/pro-matrix.service';

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
  nickname?: string;
  accountType?: string;
  regionName?: string;
  saleArea?: string;
  region?: string;
  province?: string;
  city?: string;
  storeName?: string;
  authorUrl?: string;
  fans?: string | number;
  operatorName?: string;
  operatorMobile?: string;
  accountTag?: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class KoxService {
  constructor(
    private prisma: PrismaService,
    private proMatrixSvc: ProMatrixService,
  ) {}

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

    // 筛选项只统计未停用账号（disabled=非大区刷新对照表基线）
    const facetWhere: Prisma.KosAccountWhereInput = { ...where, status: { not: 'disabled' } };
    const [total, rows, regionFacets, tagFacets] = await Promise.all([
      this.prisma.kosAccount.count({ where }),
      this.prisma.kosAccount.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kosAccount.groupBy({ by: ['regionName'], where: facetWhere }).then(
        (g) =>
          g
            .map((x) => x.regionName)
            .filter((x): x is string => !!x)
            .sort((a, b) => a.localeCompare(b, 'zh')),
      ),
      this.prisma.kosAccount.groupBy({ by: ['accountTag'], where: facetWhere }).then(
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
    accountTag?: string;
    regionName?: string;
  }) {
    // 时间边界按东八区解析（与周度快照口径一致）；UTC 解析会导致结束日 08:00 后的数据被截掉
    const asDayStart = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000+08:00`) : new Date(s);
    const asDayEnd = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.999+08:00`) : new Date(s);
    const end = query.end ? asDayEnd(query.end) : new Date();
    const start = query.start
      ? asDayStart(query.start)
      : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    const platform = query.platform || 'all';
    const brandId = query.brandId ? Number(query.brandId) : undefined;
    const accountTag = query.accountTag || '';
    const regionName = query.regionName || '';

    const where: Prisma.KoxDailyStatWhereInput = {
      platform,
      statDate: { gte: start, lte: end },
      ...(brandId !== undefined ? { brandId } : {}),
    };
    const accountWhere: Prisma.KosAccountWhereInput = {
      ...(brandId ? { brandId } : {}),
      ...(accountTag ? { accountTag } : {}),
      ...(regionName ? { regionName } : {}),
      // 字段1：账号基线 = 大区刷新对照表（192 户），非对照表账号置 disabled 不计入
      status: 'enabled',
    };
    const campaignWhere: Prisma.KoxCampaignDailyStatWhereInput = {
      statDate: { gte: start, lte: end },
      ...(brandId ? { brandId } : {}),
    };
    // 标签/大区筛选传导到笔记：按账号关联（accountId）或作者昵称兜底
    let noteWhere: Prisma.KoxNoteWhereInput = {
      publishTime: { gte: start, lte: end },
      ...(brandId ? { brandId } : {}),
    };
    let filteredAccounts: { id: number; nickname: string }[] | null = null;
    if (accountTag || regionName) {
      filteredAccounts = await this.prisma.kosAccount.findMany({
        where: accountWhere,
        select: { id: true, nickname: true },
      });
      noteWhere = {
        ...noteWhere,
        OR: [
          { account: { id: { in: filteredAccounts.map((a) => a.id) } } },
          { authorName: { in: filteredAccounts.map((a) => a.nickname) } },
        ],
      };
    }
    const noteRowsP: Promise<{
      authorName: string | null;
      views: number;
      exposure: number;
      likes: number;
      comments: number;
      shares: number;
      collects: number;
      followCount: number;
      pmInquiries: number;
      pmOpenings: number;
      pmLeads: number;
      isRtbAdver: boolean | null;
      publishTime: Date | null;
    }[]> =
      // 特斯拉不再使用 KoxNote（星火 partner 通道停更已弃用），内容指标走专业号员工矩阵
      brandId === 6
        ? Promise.resolve([])
        : this.prisma.koxNote.findMany({
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
              pmInquiries: true,
              pmOpenings: true,
              pmLeads: true,
              isRtbAdver: true,
              publishTime: true,
            },
          });
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
      noteRowsP,
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

    // 发布区块：其他品牌星火笔记明细优先，无数据时回退 KoxDailyStat；特斯拉在矩阵快照就绪后覆盖
    const noteAuthors = new Set(
      noteRows.map((n) => n.authorName).filter((a): a is string => !!a),
    );
    const noteSum = (f: (n: (typeof noteRows)[number]) => number) =>
      noteRows.reduce((acc, n) => acc + f(n), 0);
    const noteViewSum = noteSum((n) => n.views);
    const noteExposureSum = noteSum((n) => n.exposure);
    const noteInteractionSum = noteSum(
      (n) => n.likes + n.comments + n.shares + n.collects + n.followCount,
    );
    const hasNotes = noteRows.length > 0;

    let publish = hasNotes
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

    // 账号总览两卡 + 大区分布 + 大区内容发布数：随大区/标签筛选联动（与前端 tooltip 口径一致）
    // 字段1：账号基线 = 大区刷新对照表（disabled 账号不计入）
    const globalAccountWhere: Prisma.KosAccountWhereInput = {
      ...(filteredAccounts
        ? { id: { in: filteredAccounts.map((a) => a.id) } }
        : brandId
          ? { brandId }
          : {}),
      status: 'enabled',
    };
    const gNotesP: Promise<{
      accountId: number | null;
      authorName: string | null;
      exposure: number;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      collects: number;
      pmLeads: number;
    }[]> =
      brandId === 6
        ? Promise.resolve([])
        : this.prisma.koxNote.findMany({
            where: noteWhere,
            select: {
              accountId: true,
              authorName: true,
              exposure: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              collects: true,
              pmLeads: true,
            },
          });
    const [gAccs, gNotes] = await Promise.all([
      this.prisma.kosAccount.findMany({
        where: globalAccountWhere,
        select: { id: true, nickname: true, regionName: true, storeName: true, fans: true, noteQuality: true, accountTag: true, authorId: true },
      }),
      gNotesP,
    ]);

    // 客户周度表快照（KoxWeeklySnapshot）已停用；brand6 指标口径（客户指定，2026-10）：
    // 发布数 = 聚光「商业内容管理」逐笔记（KoxContentNoteDaily，notePublishTime∈窗口去重）；
    // 曝光/阅读(点击)/互动 = 专业号「数据中心-员工数据」（dateType=4 逐日求和优先、三档快照回退）；
    // 大区内容分布按指标拆源：发布=A、三数=E、私信=G（获客工具统计，与账号表现分析同口径）。
    let proContent: {
      item_cnt: number;
      exposure_sum: number;
      view_sum: number;
      interaction_sum: number;
      author_num: number;
      date_type: number;
      stat_date: Date;
      region_content: { region: string; item_cnt: number; exposure_sum: number; view_sum: number; interaction_sum: number; pm_leads: number }[];
    } | null = null;

    // —— A：发布数（窗口内发布笔记去重 + 作者数 + 逐日发布线 + 账号归属计数）——
    const contentPubRows = brandId === 6
      ? await this.prisma.koxContentNoteDaily.findMany({
          where: { brandId: 6, day: { gte: start, lte: end } },
          select: { noteId: true, authorName: true, notePublishTime: true },
        })
      : [];
    const pubWinStart = dayKey08(start);
    const pubWinEnd = dayKey08(end);
    const pubAuthorOf = new Map<string, string | null>();
    const pubNoteIds = new Set<string>();
    const pubDayNotes = new Map<string, Set<string>>();
    for (const c of contentPubRows) {
      if (!pubAuthorOf.has(c.noteId)) pubAuthorOf.set(c.noteId, c.authorName);
      if (!c.notePublishTime) continue;
      const pd = dayKey08(c.notePublishTime);
      if (pd < pubWinStart || pd > pubWinEnd) continue;
      pubNoteIds.add(c.noteId);
      if (!pubDayNotes.has(pd)) pubDayNotes.set(pd, new Set());
      pubDayNotes.get(pd)!.add(c.noteId);
    }
    // noteId→KoxNote.accountId 映射（accountId 优先、作者名兜底归属基线账号）
    const pubAccId = new Map<string, number | null>();
    const pubIds = [...pubAuthorOf.keys()];
    for (let i = 0; i < pubIds.length; i += 500) {
      const chunk = pubIds.slice(i, i + 500);
      const metaRows = await this.prisma.koxNote.findMany({
        where: { brandId: 6, noteId: { in: chunk } },
        select: { noteId: true, accountId: true },
      });
      for (const m of metaRows) pubAccId.set(m.noteId, m.accountId);
    }
    const gAccById = new Map(gAccs.map((a) => [a.id, a]));
    const gAccByNick = new Map(gAccs.map((a) => [a.nickname, a]));
    const pubCntByAcc = new Map<number, number>();
    for (const noteId of pubNoteIds) {
      const accId = pubAccId.get(noteId);
      const acc =
        (accId != null ? gAccById.get(accId) : undefined) ??
        gAccByNick.get(pubAuthorOf.get(noteId) ?? '');
      if (!acc) continue; // 未匹配基线账号（含官号）不入统计
      pubCntByAcc.set(acc.id, (pubCntByAcc.get(acc.id) ?? 0) + 1);
    }
    const pubAuthorKeys = new Set<string>();
    for (const noteId of pubNoteIds) {
      const accId = pubAccId.get(noteId);
      if (accId != null) pubAuthorKeys.add(`a${accId}`);
      else {
        const nm = pubAuthorOf.get(noteId) ?? '';
        if (nm) pubAuthorKeys.add(`n${nm}`);
      }
    }
    const pubItemCnt = pubNoteIds.size;
    const pubAuthorNum = pubAuthorKeys.size;

    // —— E：员工矩阵（曝光/阅读/互动；发布数不用矩阵，保持 A 口径）——
    let staffUse: ProMatrixResult['rows'] = [];
    let matrixMeta: { source: string; dateType: number; statDate: Date } | null = null;
    if (brandId === 6) {
      const proMatrix = await this.proMatrixSvc.proMatrix(6, start, end);
      if (proMatrix) {
        staffUse = proMatrix.rows;
        matrixMeta = { source: proMatrix.source, dateType: proMatrix.dateType, statDate: proMatrix.statDate };
        if (accountTag || regionName) {
          staffUse = proMatrix.rows.filter((s) => {
            const a = gAccByNick.get(s.nickName);
            return (
              !!a &&
              (!accountTag || a.accountTag === accountTag) &&
              (!regionName || a.regionName === regionName)
            );
          });
        }
      }
    }
    const eSum = (f: (s: (typeof staffUse)[number]) => number) => staffUse.reduce((acc, s) => acc + f(s), 0);
    const eExposure = eSum((s) => s.socImpCnt);
    const eView = eSum((s) => s.socClickCnt);
    const eInter = eSum((s) => s.socEnageCnt);

    // —— G：私信三数（逐账号 + 大区分桶；供 proContent.pm_leads 与 lead_funnel 共用）——
    const clueByUid = new Map<string, { enter: number; open: number; leads: number }>();
    let proClueFunnel: { enter: number; open: number; leads: number } | null = null;
    if (brandId === 6) {
      const clueUids = gAccs.map((a) => a.authorId).filter(Boolean);
      if (clueUids.length) {
        const toolRows = await this.prisma.proClueToolStatDaily.findMany({
          where: {
            brandId: 6,
            day: { gte: start, lte: end },
            belongUserId: { in: clueUids as string[] },
          },
          select: {
            belongUserId: true, consultUserCnt: true, msgChatUserCnt: true, msgLeadsUserCnt: true,
            serviceCardLeadsUserCnt: true, qwAddLeadsUserCnt: true, bookCompLeadsUserCnt: true,
            landingPageLeadsUserCnt: true, wechatLeadsUserCnt: true, appCardLeadsUserCnt: true,
            otherLeadsUserCnt: true,
          },
        });
        for (const r of toolRows) {
          const cur = clueByUid.get(r.belongUserId) ?? { enter: 0, open: 0, leads: 0 };
          cur.enter += r.consultUserCnt;
          cur.open += r.msgChatUserCnt;
          cur.leads +=
            r.msgLeadsUserCnt + r.serviceCardLeadsUserCnt + r.qwAddLeadsUserCnt +
            r.bookCompLeadsUserCnt + r.landingPageLeadsUserCnt + r.wechatLeadsUserCnt +
            r.appCardLeadsUserCnt + r.otherLeadsUserCnt;
          clueByUid.set(r.belongUserId, cur);
        }
        const totals = { enter: 0, open: 0, leads: 0 };
        for (const v of clueByUid.values()) {
          totals.enter += v.enter;
          totals.open += v.open;
          totals.leads += v.leads;
        }
        proClueFunnel = totals;
      }
    }

    // —— 组装 proContent（大区内容分布拆源）——
    if (brandId === 6) {
      const regionAgg = new Map<
        string,
        { item_cnt: number; exposure_sum: number; view_sum: number; interaction_sum: number; pm_leads: number }
      >();
      const bumpRegion = (region: string | null | undefined) => {
        if (!region) return null; // 匹配不上大区的不进区域图（保持大区横轴）
        const cur =
          regionAgg.get(region) ??
          { item_cnt: 0, exposure_sum: 0, view_sum: 0, interaction_sum: 0, pm_leads: 0 };
        regionAgg.set(region, cur);
        return cur;
      };
      for (const [accId, cnt] of pubCntByAcc) {
        const cur = bumpRegion(gAccById.get(accId)?.regionName);
        if (cur) cur.item_cnt += cnt;
      }
      for (const s of staffUse) {
        const cur = bumpRegion(gAccByNick.get(s.nickName)?.regionName);
        if (!cur) continue;
        cur.exposure_sum += s.socImpCnt;
        cur.view_sum += s.socClickCnt;
        cur.interaction_sum += s.socEnageCnt;
      }
      for (const a of gAccs) {
        if (!a.authorId) continue;
        const v = clueByUid.get(a.authorId);
        if (!v) continue;
        const cur = bumpRegion(a.regionName);
        if (cur) cur.pm_leads += v.leads;
      }
      proContent = {
        item_cnt: pubItemCnt,
        exposure_sum: eExposure,
        view_sum: eView,
        interaction_sum: eInter,
        author_num: pubAuthorNum,
        date_type: matrixMeta?.dateType ?? 0,
        stat_date: matrixMeta?.statDate ?? start,
        region_content: [...regionAgg.entries()]
          .map(([region, v]) => ({ region, ...v }))
          .sort((a, b) => b.item_cnt - a.item_cnt),
      };
    }

    // 发布区块（特斯拉）：发布=A；曝光/阅读/互动=E；新增粉丝=B（商业内容管理按日合计）
    const csSum = brandId === 6
      ? await this.prisma.koxContentStatDaily.aggregate({
          where: { brandId: 6, day: { gte: start, lte: end } },
          _sum: { followCnt: true },
        })
      : null;
    const followCntSum = Number(csSum?._sum.followCnt ?? 0);
    if (brandId === 6) {
      publish = {
        author_num: pubAuthorNum,
        item_cnt: pubItemCnt,
        crazy_item_cnt: 0,
        item_author_ratio: pubAuthorNum ? r2(pubItemCnt / pubAuthorNum) : 0,
        follow_count_sum: followCntSum,
        exposure_sum: eExposure,
        view_sum: eView,
        interaction_sum: eInter,
        interaction_rate: eView ? r2((eInter / eView) * 100) : 0,
        tool_item_cnt_sum: 0,
      };
    }

    const regionOfId = new Map<number, string>();
    const regionOfName = new Map<string, string>();
    for (const a of gAccs) {
      const r = a.regionName ?? a.storeName ?? '未知区域';
      regionOfId.set(a.id, r);
      if (a.nickname && !regionOfName.has(a.nickname)) regionOfName.set(a.nickname, r);
    }
    const kosByRegion = new Map<string, number>();
    for (const a of gAccs) {
      const r = a.regionName ?? a.storeName ?? '未知区域';
      kosByRegion.set(r, (kosByRegion.get(r) ?? 0) + 1);
    }
    interface RegionContent {
      item_cnt: number;
      exposure_sum: number;
      view_sum: number;
      interaction_sum: number;
      pm_leads: number;
    }
    const contentByRegion = new Map<string, RegionContent>();
    for (const n of gNotes) {
      const r =
        (n.accountId != null ? regionOfId.get(n.accountId) : undefined) ??
        (n.authorName ? regionOfName.get(n.authorName) : undefined) ??
        '未匹配';
      const cur =
        contentByRegion.get(r) ??
        { item_cnt: 0, exposure_sum: 0, view_sum: 0, interaction_sum: 0, pm_leads: 0 };
      cur.item_cnt += 1;
      cur.exposure_sum += n.exposure;
      cur.view_sum += n.views;
      cur.interaction_sum += n.likes + n.comments + n.shares + n.collects;
      cur.pm_leads += n.pmLeads;
      contentByRegion.set(r, cur);
    }
    const globalBlock = {
      kos_num: gAccs.length,
      store_num: new Set(gAccs.filter((a) => a.storeName).map((a) => a.storeName)).size,
      fans_sum: gAccs.reduce((s, a) => s + a.fans, 0),
      quality_num: gAccs.filter((a) => (a.noteQuality ?? 0) >= 30).length,
      region_kos: [...kosByRegion.entries()]
        .map(([region, cnt]) => ({ region, kos_cnt: cnt }))
        .sort((a, b) => b.kos_cnt - a.kos_cnt),
      region_content:
        brandId === 6
          ? (proContent?.region_content ?? [])
          : [...contentByRegion.entries()]
              .map(([region, v]) => ({ region, ...v }))
              .sort((a, b) => b.item_cnt - a.item_cnt),
    };

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

    // 特斯拉线索口径（proClueFunnel）已在上方 G 块计算：专业号「客户管理（旧版）获客工具统计」
    // 严格单源——窗口内无数据如实显示 0，不再回退 ProKosOverview 快照/周度表（客户确认，2026-10）

    return {
      global: globalBlock,
      store_num: await this.prisma.kosAccount.groupBy({
        by: ['storeName'],
        where: { storeName: { not: null }, ...accountWhere },
      }).then((g) => g.length),
      kos_num: typeCount('KOS'),
      kob_num: typeCount('KOB'),
      koc_num: typeCount('KOC'),
      publish,
      publish_source: brandId === 6
        ? pubItemCnt > 0
          ? 'content_manage_notes'
          : 'content_manage_no_data'
        : hasNotes
          ? 'spark_notes'
          : 'kox_daily_stat',
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
      // 特斯拉版汇总条（账号标签/大区筛选联动）：KOS数/门店数/粉丝覆盖/内容四指标/账均发布
      // 特斯拉口径（客户指定）：发布=A 商业内容管理逐笔记；曝光/阅读/互动=E 员工数据（逐日求和/三档快照）；
      // 新增粉丝=B 商业内容管理按日合计；点击率=E 点击/曝光；其他品牌=商业内容管理同步的笔记窗口数据
      summary: await (async () => {
        const [fansAgg, storeGroups, accountTotal] = await Promise.all([
          this.prisma.kosAccount.aggregate({ where: accountWhere, _sum: { fans: true } }),
          this.prisma.kosAccount.groupBy({
            by: ['storeName'],
            where: { storeName: { not: null }, ...accountWhere },
          }),
          this.prisma.kosAccount.count({ where: accountWhere }),
        ]);
        const itemCntN = brandId === 6 ? pubItemCnt : noteRows.length;
        const exposureN = brandId === 6 ? eExposure : noteExposureSum;
        const viewN = brandId === 6 ? eView : noteViewSum;
        const interN = brandId === 6 ? eInter : noteInteractionSum;
        return {
          kos_num: accountTotal,
          store_num: storeGroups.length,
          fans_sum: fansAgg._sum.fans ?? 0,
          item_cnt: itemCntN,
          exposure_sum: exposureN,
          view_sum: viewN,
          interaction_sum: interN,
          // 互动率 = 互动量/阅读量（与 interaction_sum/view_sum 同口径）
          interaction_rate: viewN
            ? r2((interN / viewN) * 100)
            : 0,
          // 新增粉丝数：特斯拉=商业内容管理 followCnt 窗口加总；其他品牌=聚光种草人群/笔记涨粉
          follow_count_sum: brandId === 6
            ? followCntSum
            : noteRows.reduce((acc, n) => acc + n.followCount, 0),
          // 点击率（特斯拉）= 员工数据 点击/曝光
          ...(brandId === 6
            ? (eExposure > 0 ? { ctr: r2((eView / eExposure) * 100) } : {})
            : {}),
          avg_publish: accountTotal ? r2(itemCntN / accountTotal) : 0,
        };
      })(),
      content_source: brandId === 6
        ? `juguang_content_publish + pro_staff_${matrixMeta?.source ?? 'no_partition'}(窗口 ${dayKey08(start)}~${dayKey08(end)})`
        : 'content_manage_notes(笔记窗口数据)',
      // 特斯拉口径明细（员工矩阵来源/分区）
      pro_content: proContent,
      // 特斯拉版线索转化漏斗：专业号「线索经营」KOS 口径（权威，覆盖周度快照/线下表）> 周度快照 > 投放+自然 > 专业号总数据
      lead_funnel: await (async () => {
        if (proClueFunnel && (proClueFunnel.enter > 0 || proClueFunnel.leads > 0)) {
          const { enter, open, leads } = proClueFunnel;
          return {
            pm_inquiries: enter,
            pm_openings: open,
            pm_leads: leads,
            total_leads: leads,
            open_rate: enter ? r2((open / enter) * 100) : 0,
            lead_rate: enter ? r2((leads / enter) * 100) : 0,
            campaign: { enter: 0, open: 0, leads: 0 },
            organic: { inquiries: 0, openings: 0, leads: 0 },
            scope_note: '线索=小红书专业号·客户管理（旧版）获客工具统计（KOS 口径，剔除官号「特斯拉」；按日×归属账号求和，与账号表现分析一致；行为时间落窗口内）',
            source: 'pro_clue',
          };
        }
        // 客户周度表快照分支已移除（KoxWeeklySnapshot 停用，2026-10-08 客户确认）
        if (brandId !== 6) {
          // G2（非专业号口径，仅非 brand6 品牌）：线索=投放逐日聚合（乐允报表+partner T+1）+ 自然笔记私信
          let funnelCampaign = { enter: 0, open: 0, leads: 0 };
          const campNickSet = filteredAccounts ? new Set(filteredAccounts.map((a) => a.nickname)) : null;
          for (const r of campaignRows) {
            if (campNickSet && !(r.brandUserName && campNickSet.has(r.brandUserName))) continue;
            funnelCampaign.enter += r.messageConsult;
            funnelCampaign.open += r.msgChatUserCnt;
            funnelCampaign.leads += r.msgLeadsNum;
          }
          let organic = { inquiries: 0, openings: 0, leads: 0 };
          for (const n of noteRows) {
            if (n.isRtbAdver === true) continue;
            organic.inquiries += n.pmInquiries;
            organic.openings += n.pmOpenings;
            organic.leads += n.pmLeads;
          }
          if (campaignRows.length > 0 || organic.inquiries > 0 || organic.leads > 0) {
            const inquiries = funnelCampaign.enter + organic.inquiries;
            const openings = funnelCampaign.open + organic.openings;
            const leads = funnelCampaign.leads + organic.leads;
            return {
              pm_inquiries: inquiries,
              pm_openings: openings,
              pm_leads: leads,
              open_rate: inquiries ? r2((openings / inquiries) * 100) : 0,
              lead_rate: inquiries ? r2((leads / inquiries) * 100) : 0,
              campaign: funnelCampaign,
              organic,
              scope_note: `线索=星火聚光投放逐日 T+1 + 自然笔记私信，随区间与大区/标签筛选变化`,
            };
          }
        }
        // 特斯拉严格单源：G（获客工具统计）无数据时如实 0，不再回退专业号快照
        return {
          pm_inquiries: 0,
          pm_openings: 0,
          pm_leads: 0,
          open_rate: 0,
          lead_rate: 0,
          campaign: { enter: 0, open: 0, leads: 0 },
          organic: { inquiries: 0, openings: 0, leads: 0 },
          scope_note: '所选区间无线索数据',
        };
      })(),
      trend: await (async () => {
        const campByDate = new Map<
          string,
          {
            fee: number;
            impression: number;
            click: number;
            msg_leads: number;
            msg_enter: number;
            msg_open: number;
          }
        >();
        for (const c of campaignRows) {
          const key = dayKey08(c.statDate);
          const cur =
            campByDate.get(key) ?? {
              fee: 0,
              impression: 0,
              click: 0,
              msg_leads: 0,
              msg_enter: 0,
              msg_open: 0,
            };
          cur.fee += Number(c.fee);
          cur.impression += c.impression;
          cur.click += c.click;
          cur.msg_leads += c.msgLeadsNum;
          cur.msg_enter += c.messageConsult;
          cur.msg_open += c.msgChatUserCnt;
          campByDate.set(key, cur);
        }
        const noteByDate = new Map<
          string,
          {
            item_cnt: number;
            view_sum: number;
            exposure_sum: number;
            interaction_sum: number;
            ces_sum: number;
          }
        >();
        for (const n of noteRows) {
          if (!n.publishTime) continue;
          const key = dayKey08(n.publishTime);
          const cur =
            noteByDate.get(key) ?? {
              item_cnt: 0,
              view_sum: 0,
              exposure_sum: 0,
              interaction_sum: 0,
              ces_sum: 0,
            };
          cur.item_cnt += 1;
          cur.view_sum += n.views;
          cur.exposure_sum += n.exposure;
          cur.interaction_sum += n.likes + n.comments + n.shares + n.collects;
          cur.ces_sum += calcCes(
            n.likes,
            n.collects,
            n.comments,
            n.shares,
            n.followCount,
          );
          noteByDate.set(key, cur);
        }
        const byDate = new Map<
          string,
          {
            item_cnt: number;
            view_sum: number;
            exposure_sum: number;
            interaction_sum: number;
            ces_sum: number;
            total_pm_leads: number;
            ad_cost: number;
            ad_impression: number;
            ad_click: number;
            ad_msg_leads: number;
            ad_msg_enter: number;
            ad_msg_open: number;
          }
        >();
        const emptyRow = () => ({
          item_cnt: 0,
          view_sum: 0,
          exposure_sum: 0,
          interaction_sum: 0,
          ces_sum: 0,
          total_pm_leads: 0,
        });
        const campPart = (camp?: {
          fee: number;
          impression: number;
          click: number;
          msg_leads: number;
          msg_enter: number;
          msg_open: number;
        }) => ({
          ad_cost: r2(camp?.fee ?? 0),
          ad_impression: camp?.impression ?? 0,
          ad_click: camp?.click ?? 0,
          ad_msg_leads: camp?.msg_leads ?? 0,
          ad_msg_enter: camp?.msg_enter ?? 0,
          ad_msg_open: camp?.msg_open ?? 0,
        });
        for (const r of rows) {
          const key = dayKey08(r.statDate);
          const camp = campByDate.get(key);
          byDate.set(key, {
            item_cnt: r.itemCnt,
            view_sum: r.viewSum,
            exposure_sum: r.exposureSum,
            interaction_sum: r.interactionSum,
            ces_sum: 0,
            total_pm_leads: r.totalPmLeads,
            ...campPart(camp),
          });
        }
        for (const [key, v] of noteByDate) {
          if (!byDate.has(key)) {
            byDate.set(key, {
              ...emptyRow(),
              item_cnt: v.item_cnt,
              view_sum: v.view_sum,
              exposure_sum: v.exposure_sum,
              interaction_sum: v.interaction_sum,
              ...campPart(campByDate.get(key)),
            });
          }
        }
        for (const [key, camp] of campByDate) {
          if (!byDate.has(key)) {
            byDate.set(key, { ...emptyRow(), ...campPart(camp) });
          }
        }
        // 特斯拉趋势口径（客户指定，2026-10）：
        // 发布线 = A 商业内容管理逐日发布数（notePublishTime 当日去重）；
        // 曝光/阅读/互动线 = E 员工数据日档（dateType=4）逐日求和；窗口无日档分区 → 回退 A 逐日；
        // 投放三线（进线/开口/留资）= C 聚光标准投笔记报表逐日（与周期报表同口径）
        if (brandId === 6) {
          for (const [key, ids] of pubDayNotes) {
            const cur = byDate.get(key) ?? { ...emptyRow(), ...campPart(campByDate.get(key)) };
            cur.item_cnt = ids.size;
            byDate.set(key, cur);
          }
          const eDayRows = await this.prisma.proKosStaff.findMany({
            where: {
              brandId: 6,
              dateType: PRO_STAFF_DAY_DATE_TYPE,
              statDate: {
                gte: new Date(`${pubWinStart}T00:00:00`),
                lte: new Date(`${pubWinEnd}T23:59:59.999`),
              },
            },
            select: { statDate: true, socImpCnt: true, socClickCnt: true, socEnageCnt: true },
          });
          const eByDay = new Map<string, { imp: number; click: number; inter: number }>();
          for (const r of eDayRows) {
            const k = dayKey08(r.statDate);
            const cur = eByDay.get(k) ?? { imp: 0, click: 0, inter: 0 };
            cur.imp += r.socImpCnt;
            cur.click += r.socClickCnt;
            cur.inter += r.socEnageCnt;
            eByDay.set(k, cur);
          }
          if (eByDay.size > 0) {
            for (const [key, v] of eByDay) {
              const cur = byDate.get(key) ?? { ...emptyRow(), ...campPart(campByDate.get(key)) };
              cur.exposure_sum = v.imp;
              cur.view_sum = v.click;
              cur.interaction_sum = v.inter;
              byDate.set(key, cur);
            }
          } else {
            // 回退：窗口无 E 日档分区（回填未覆盖的历史）→ A 逐日（商业内容管理逐笔记表现）
            const aDaily = await this.prisma.koxContentNoteDaily.groupBy({
              by: ['day'],
              where: { brandId: 6, day: { gte: start, lte: end } },
              _sum: { impNum: true, readFeedNum: true, engageCnt: true },
              orderBy: { day: 'asc' },
            });
            for (const d of aDaily) {
              const key = dayKey08(d.day);
              const cur = byDate.get(key) ?? { ...emptyRow(), ...campPart(campByDate.get(key)) };
              cur.exposure_sum = Number(d._sum.impNum ?? 0);
              cur.view_sum = Number(d._sum.readFeedNum ?? 0);
              cur.interaction_sum = Number(d._sum.engageCnt ?? 0);
              byDate.set(key, cur);
            }
          }
          const jugMsgDaily = await this.prisma.koxJuguangNoteDaily.groupBy({
            by: ['day'],
            where: { brandId: 6, day: { gte: start, lte: end } },
            _sum: { msgInquiries: true, msgOpenings: true, msgLeads: true },
            orderBy: { day: 'asc' },
          });
          for (const d of jugMsgDaily) {
            const key = dayKey08(d.day);
            const cur = byDate.get(key) ?? { ...emptyRow(), ...campPart(campByDate.get(key)) };
            cur.ad_msg_enter = Number(d._sum.msgInquiries ?? 0);
            cur.ad_msg_open = Number(d._sum.msgOpenings ?? 0);
            cur.ad_msg_leads = Number(d._sum.msgLeads ?? 0);
            byDate.set(key, cur);
          }
        }
        // 横轴按查询区间逐日铺满（无数据天补 0），上限 366 天
        const padDay = (n: number) => String(n).padStart(2, '0');
        const dayKeyOf = (d: Date) => `${d.getFullYear()}-${padDay(d.getMonth() + 1)}-${padDay(d.getDate())}`;
        const trendStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const trendEndKey = dayKeyOf(end);
        const trendOut: Record<string, unknown>[] = [];
        for (let guard = 0; guard < 366; guard++) {
          const key = dayKeyOf(trendStart);
          const v = byDate.get(key);
          trendOut.push({ date: key, ...(v ?? { ...emptyRow(), ...campPart(campByDate.get(key)) }) });
          if (key === trendEndKey) break;
          trendStart.setDate(trendStart.getDate() + 1);
        }
        return trendOut;
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
        time_range: `${dayKey08(t.startTime)} ~ ${dayKey08(t.endTime)}`,
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
      start: dayKey08(start),
      end: dayKey08(end),
      summary: { ...summary, account_num: accountTotal, group_num: groups.length },
      list: groups
        .slice((page - 1) * pageSize, page * pageSize)
        .map((g, i) => ({ rank: (page - 1) * pageSize + i + 1, ...g })),
      total: groups.length,
      page,
      page_size: pageSize,
    };
  }

  private async noteFilters(query: {
    brandId?: string;
    start?: string;
    end?: string;
    noteType?: string;
    category?: string;
    modelTag?: string;
    keyword?: string;
    author?: string;
    isRtbAdver?: string;
    accountTag?: string;
    regionName?: string;
  }): Promise<{
    where: Prisma.KoxNoteWhereInput;
    base: Prisma.KoxNoteWhereInput;
    start: Date;
    end: Date;
  }> {
    // 日期字符串按东八区解析，避免服务器时区差异导致统计窗口漂移
    const end = query.end
      ? /^\d{4}-\d{2}-\d{2}$/.test(query.end)
        ? new Date(`${query.end}T23:59:59.999+08:00`)
        : new Date(query.end)
      : new Date();
    if (!query.end) end.setHours(23, 59, 59, 999);
    const start = query.start
      ? /^\d{4}-\d{2}-\d{2}$/.test(query.start)
        ? new Date(`${query.start}T00:00:00.000+08:00`)
        : new Date(query.start)
      : new Date(end.getTime() - 29 * 86400000);
    if (!query.start) start.setHours(0, 0, 0, 0);

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
    if (query.accountTag || query.regionName) {
      const scoped = { ...(query.accountTag ? { accountTag: query.accountTag } : {}), ...(query.regionName ? { regionName: query.regionName } : {}) };
      const accs = await this.prisma.kosAccount.findMany({
        where: scoped,
        select: { id: true, nickname: true },
      });
      const and: Prisma.KoxNoteWhereInput[] = [
        {
          OR: [
            { account: { id: { in: accs.map((a) => a.id) } } },
            { authorName: { in: accs.map((a) => a.nickname) } },
          ],
        },
      ];
      if (where.OR) and.push({ OR: where.OR as Prisma.KoxNoteWhereInput[] });
      where.AND = and;
      delete where.OR;
    }
    return { where, base, start, end };
  }

  /** 内容表现分析 · 词云（title=笔记标题话题 / comments=用户评论意图）；
   *  分词用 Node 原生 Intl.Segmenter（零依赖），过滤：单字/纯数字/标点符号emoji/停用词；车型词原子化保留 */
  async notesWordcloud(query: {
    brandId?: string;
    start?: string;
    end?: string;
    category?: string;
    modelTag?: string;
    author?: string;
    keyword?: string;
    source?: string;
  }) {
    const source = query.source === 'comments' ? 'comments' : 'title';
    const brandId = query.brandId ? Number(query.brandId) : 6;
    const { where, start, end } = await this.noteFilters(query);
    const seg = new (Intl as any).Segmenter('zh-CN', { granularity: 'word' });

    const agg = new Map<string, { count: number; engagement: number }>();
    const MODEL_RE = /(cybertruck|model\s?(?:3p|yl|yp|3|y|s|x))/gi;
    const addToken = (raw: string, engagement: number) => {
      let w = raw.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!w || w.length < 2) return; // 单字/单字母
      if (/^[\d\s.]+$/.test(w)) return; // 纯数字
      if (/^[\p{P}\p{S}\p{Zs}\p{C}]+$/u.test(w)) return; // 标点/符号/emoji
      if (/^model\s?[a-z0-9]*$/.test(w)) w = w.replace(/\s+/g, ''); // 车型词归一（model 3/model3 → model3）
      if (NOTES_WC_STOPWORDS.has(w)) return;
      const cur = agg.get(w) || { count: 0, engagement: 0 };
      cur.count += 1;
      cur.engagement += engagement;
      agg.set(w, cur);
    };
    const addText = (text: string, engagement: number) => {
      if (!text) return;
      const clean = text.replace(/\[[^\]]{1,8}\]/g, ' '); // 去掉 [偷笑] 等表情名
      const models = clean.match(MODEL_RE) || [];
      for (const m of models) addToken(m, engagement);
      for (const s of seg.segment(clean.replace(MODEL_RE, ' '))) {
        if (!(s as any).isWordLike) continue;
        addToken(s.segment, engagement);
      }
    };

    let totalTexts = 0;
    if (source === 'comments') {
      // 评论词云：来鼓评论（当前仅 brand6 有评论接入）；页面笔记级筛选（车型/作者等）不影响评论维度
      const rows = await this.prisma.laiguComment.findMany({
        where: { brandId, createdAt: { gte: start, lte: end } },
        select: { content: true },
      });
      totalTexts = rows.length;
      for (const r of rows) addText(r.content || '', 1);
    } else {
      const rows = await this.prisma.koxNote.findMany({
        where,
        select: { title: true, likes: true, collects: true, comments: true, shares: true },
      });
      totalTexts = rows.length;
      for (const n of rows) addText(n.title || '', n.likes + n.collects + n.comments + n.shares);
    }

    const words = [...agg.entries()]
      .map(([word, v]) => ({ word, count: v.count, engagement: v.engagement }))
      .sort((a, b) => b.count - a.count || b.engagement - a.engagement)
      .slice(0, 120);
    return { source, start, end, total_texts: totalTexts, words };
  }

  /** 笔记级指标加总（brand6 笔记排行/内容表现/热门内容口径）：
   *  曝光=ΣimpNum、阅读=ΣreadFeedNum、互动=ΣengageCnt ← 聚光「商业内容管理」逐笔记（A，全量笔记覆盖）；
   *  私信三数 ← 聚光「标准投笔记报表」（C，投流口径） */
  private async juguangNoteMap(brandId: number) {
    const empty = new Map<string, { imp: number; click: number; inter: number; inq: number; open: number; leads: number }>();
    if (brandId !== 6) return empty;
    const [contentRows, jugRows] = await Promise.all([
      this.prisma.koxContentNoteDaily.groupBy({
        by: ['noteId'],
        where: { brandId: 6 },
        _sum: { impNum: true, readFeedNum: true, engageCnt: true },
      }),
      this.prisma.koxJuguangNoteDaily.groupBy({
        by: ['noteId'],
        where: { brandId: 6 },
        _sum: {
          msgInquiries: true,
          msgOpenings: true,
          msgLeads: true,
        },
      }),
    ]);
    const map = new Map<string, { imp: number; click: number; inter: number; inq: number; open: number; leads: number }>();
    for (const r of contentRows) {
      map.set(r.noteId, {
        imp: Number(r._sum.impNum ?? 0),
        click: Number(r._sum.readFeedNum ?? 0),
        inter: Number(r._sum.engageCnt ?? 0),
        inq: 0,
        open: 0,
        leads: 0,
      });
    }
    for (const r of jugRows) {
      const cur = map.get(r.noteId) ?? { imp: 0, click: 0, inter: 0, inq: 0, open: 0, leads: 0 };
      cur.inq = Number(r._sum.msgInquiries ?? 0);
      cur.open = Number(r._sum.msgOpenings ?? 0);
      cur.leads = Number(r._sum.msgLeads ?? 0);
      map.set(r.noteId, cur);
    }
    return map;
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
    accountTag?: string;
    regionName?: string;
    metric?: string;
    page?: string;
    page_size?: string;
  }) {
    const { where, base } = await this.noteFilters(query);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(query.page_size ?? 20) || 20));
    const brandId = query.brandId ? Number(query.brandId) : undefined;

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

    const accountInclude = {
      account: {
        select: { nickname: true, accountType: true, storeName: true },
      },
    };
    // brand6：剔除官号（特斯拉）笔记
    if (brandId === 6) where.authorName = { not: '特斯拉' };
    // brand6：曝光/阅读/互动以商业内容管理逐笔记加总为准（A）、私信三数以聚光笔记报表为准（C）
    const jug = await this.juguangNoteMap(brandId ?? 0);
    let rows;
    let total;
    if (jug.size) {
      const all = await this.prisma.koxNote.findMany({ where, include: accountInclude });
      total = all.length;
      const field = (query.metric ?? 'views') as string;
      const eff = (n: (typeof all)[number]) => {
        const jv = jug.get(n.noteId);
        if (!jv) return n;
        return {
          ...n,
          exposure: jv.imp,
          views: jv.click,
          pmInquiries: jv.inq,
          pmOpenings: jv.open,
          pmLeads: jv.leads,
        };
      };
      rows = all
        .map(eff)
        .sort((a, b) => {
          if (field === 'publishTime') {
            return (b.publishTime?.getTime() ?? 0) - (a.publishTime?.getTime() ?? 0);
          }
          const k = (field === 'exposure' ? 'exposure' : field === 'pmLeads' ? 'pmLeads' : field) as keyof (typeof all)[number];
          return Number(b[k] ?? 0) - Number(a[k] ?? 0);
        })
        .slice((page - 1) * pageSize, page * pageSize);
    } else {
      const r = await Promise.all([
        this.prisma.koxNote.count({ where }),
        this.prisma.koxNote.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: accountInclude,
        }),
      ]);
      total = r[0];
      rows = r[1];
    }
    const categoryFacets = await this.prisma.koxNote.groupBy({ by: ['category'], where: base });
    const modelFacets = await this.prisma.koxNote.groupBy({ by: ['modelTag'], where: base });

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
        is_rtb_adver: n.isRtbAdver === true,
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
    accountTag?: string;
    regionName?: string;
  }) {
    const { where } = await this.noteFilters(query);
    const rowsQ = await this.prisma.koxNote.findMany({
      where,
      select: {
        noteId: true,
        title: true,
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
    // brand6：曝光/阅读/互动以商业内容管理逐笔记加总为准（A）、私信三数以聚光笔记报表为准（C）
    const jug = await this.juguangNoteMap(query.brandId ? Number(query.brandId) : 0);
    const rows = jug.size
      ? rowsQ.map((n) => {
          const jv = jug.get(n.noteId);
          return jv
            ? { ...n, exposure: jv.imp, views: jv.click, pmInquiries: jv.inq, pmOpenings: jv.open, pmLeads: jv.leads }
            : n;
        })
      : rowsQ;

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
      keywords:
        kwFreq.size > 0
          ? [...kwFreq.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 42)
              .map(([text, count]) => ({ text, count }))
          : extractKeywords(rows.map((r) => r.title), 42),
    };
  }

  /** ─── Morgandada(5) 运营总览：账号/内容/阅读/花费/留资 hero + 内容·线索·投放三象限 + 趋势 ─── */
  async mddOverview(query: { start?: string; end?: string }) {
    const brandId = 5;
    const asDay = (s: string | undefined, endOfDay = false) =>
      s && /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? new Date(`${s}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}+08:00`)
        : undefined;
    const end = asDay(query.end, true) ?? new Date();
    const start = asDay(query.start) ?? new Date(end.getTime() - 29 * 86400000);

    const noteWhere: Prisma.KoxNoteWhereInput = { brandId, publishTime: { gte: start, lte: end } };
    const campWhere: Prisma.KoxCampaignDailyStatWhereInput = { brandId, statDate: { gte: start, lte: end } };
    const leadScope: Prisma.LaiguLeadWhereInput = {
      brandId,
      isMdd: true,
      OR: [{ sessionCreatedAt: { gte: start, lte: end } }, { lastMessageAt: { gte: start, lte: end } }],
    };

    const [kosNum, notes, campRows, leads] = await Promise.all([
      this.prisma.kosAccount.count({ where: { brandId, status: 'enabled' } }),
      this.prisma.koxNote.findMany({
        where: noteWhere,
        select: {
          noteId: true, title: true, coverUrl: true, noteUrl: true, publishTime: true, authorName: true,
          exposure: true, views: true, likes: true, collects: true, comments: true, shares: true,
          followCount: true, pmInquiries: true, pmOpenings: true, pmLeads: true,
        },
      }),
      this.prisma.koxCampaignDailyStat.findMany({
        where: campWhere,
        select: { statDate: true, fee: true, impression: true, click: true, interaction: true, msgLeadsNum: true },
      }),
      this.prisma.laiguLead.findMany({
        where: leadScope,
        select: {
          sessionId: true, isResource: true, phone: true, clientMessageCount: true,
          messageCount: true, sessionCreatedAt: true, lastMessageAt: true,
        },
      }),
    ]);

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const n = (v: unknown) => Number(v ?? 0) || 0;
    const r2 = (v: number) => (Math.round(v * 100) / 100) || 0;

    // 内容象限（笔记口径）
    const content = {
      note_cnt: notes.length,
      exposure_sum: sum(notes.map((x) => x.exposure)),
      view_sum: sum(notes.map((x) => x.views)),
      interaction_sum: sum(notes.map((x) => x.likes + x.collects + x.comments + x.shares)),
      follow_sum: sum(notes.map((x) => x.followCount)),
      author_num: new Set(notes.map((x) => x.authorName).filter(Boolean)).size,
      read_rate: 0,
      interaction_rate: 0,
    };
    content.read_rate = content.exposure_sum ? r2((content.view_sum / content.exposure_sum) * 100) : 0;
    content.interaction_rate = content.view_sum ? r2((content.interaction_sum / content.view_sum) * 100) : 0;

    // 线索象限（私信会话口径）
    const openLeads = leads.filter((x) => x.clientMessageCount > 0);
    const lead = {
      inquiry_cnt: leads.length,
      open_cnt: openLeads.length,
      open_rate: leads.length ? r2((openLeads.length / leads.length) * 100) : 0,
      resource_cnt: leads.filter((x) => x.isResource).length,
      phone_cnt: leads.filter((x) => x.phone).length,
      msg_cnt: sum(leads.map((x) => x.messageCount)),
    };

    // 投放象限（聚光投放口径）
    const ad = {
      cost: r2(sum(campRows.map((x) => n(x.fee)))),
      impression: sum(campRows.map((x) => n(x.impression))),
      click: sum(campRows.map((x) => n(x.click))),
      interaction: sum(campRows.map((x) => n(x.interaction))),
      msg_leads: sum(campRows.map((x) => n(x.msgLeadsNum))),
      ctr: 0,
      cpc: 0,
      cpm: 0,
      leads_cost: 0,
    };
    ad.ctr = ad.impression ? r2((ad.click / ad.impression) * 100) : 0;
    ad.cpc = ad.click ? r2(ad.cost / ad.click) : 0;
    ad.cpm = ad.impression ? r2((ad.cost / ad.impression) * 1000) : 0;
    ad.leads_cost = lead.resource_cnt ? r2(ad.cost / lead.resource_cnt) : 0;

    // 全链路留资（私信留资 ∪ 电话）
    const totalLeads = leads.filter((x) => x.isResource || x.phone).length;

    // 趋势（按东八区日键）
    const days: string[] = [];
    for (let t = new Date(`${dayKey08(start)}T00:00:00+08:00`).getTime(); t <= new Date(`${dayKey08(end)}T00:00:00+08:00`).getTime(); t += 86400000) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    const trendMap = new Map(days.map((d) => [d, { date: d, note_cnt: 0, view_sum: 0, interaction_sum: 0, ad_cost: 0, lead_cnt: 0 }]));
    for (const x of notes) {
      if (!x.publishTime) continue;
      const row = trendMap.get(dayKey08(x.publishTime));
      if (row) {
        row.note_cnt += 1;
        row.view_sum += x.views;
        row.interaction_sum += x.likes + x.collects + x.comments + x.shares;
      }
    }
    for (const x of campRows) {
      const row = trendMap.get(dayKey08(x.statDate));
      if (row) row.ad_cost += n(x.fee);
    }
    for (const x of leads) {
      const at = x.sessionCreatedAt ?? x.lastMessageAt;
      if (!at) continue;
      const row = trendMap.get(dayKey08(at));
      if (row) row.lead_cnt += x.isResource || x.phone ? 1 : 0;
    }

    return {
      start: dayKey08(start),
      end: dayKey08(end),
      hero: {
        kos_num: kosNum,
        note_cnt: content.note_cnt,
        view_sum: content.view_sum,
        ad_cost: ad.cost,
        total_leads: totalLeads,
      },
      content,
      lead,
      ad,
      trend: [...trendMap.values()],
    };
  }

  /** ─── Morgandada(5) 笔记合规检测：违禁词库扫描 title+content，返回逐篇命中 ─── */
  async mddNoteCompliance(query: { start?: string; end?: string; state?: string }) {
    const brandId = 5;
    const asDay = (s: string | undefined, endOfDay = false) =>
      s && /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? new Date(`${s}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}+08:00`)
        : undefined;
    const end = asDay(query.end, true) ?? new Date();
    const start = asDay(query.start) ?? new Date(end.getTime() - 29 * 86400000);

    // 违禁词库（广告法向）：绝对化用语 / 权威背书 / 夸大承诺 / 金融敏感
    const GROUPS: { group: string; words: string[] }[] = [
      { group: '绝对化用语', words: ['最好', '最优', '最佳', '最强', '第一', 'NO.1', 'TOP1', '顶级', '极致', '绝无仅有', '独一无二', '史上', '全网最低', '全网第一', '销量冠军', '行业领先', '领先者', '之首', '全球首发', '全国首发'] },
      { group: '权威背书', words: ['国家级', '国家认证', '官方认证', '质量免检', '免检', '专利', '驰名商标', '国家×', '专家推荐', '权威', '监督抽查'] },
      { group: '夸大承诺', words: ['百分之百', '100%', '稳赚', '必涨', '必买', '闭眼入', '无脑冲', '永久', '终身', '包治', '根治', '立竿见影', '秒杀', '疯抢', '最后一天', '仅此一天', '错过再无'] },
      { group: '金融敏感', words: ['零首付', '免息', '低息', '返现', '返利', '抽奖', '中签', '理财', '稳赚不赔', '保本'] },
    ];

    const rows = await this.prisma.koxNote.findMany({
      where: { brandId, publishTime: { gte: start, lte: end } },
      select: {
        noteId: true, title: true, content: true, coverUrl: true, noteUrl: true,
        noteType: true, publishTime: true, authorName: true, accountType: true,
        views: true, likes: true, collects: true, comments: true, shares: true,
      },
      orderBy: { publishTime: 'desc' },
    });

    const scanned = rows.map((x) => {
      const text = `${x.title ?? ''}\n${x.content ?? ''}`;
      const hits: { group: string; word: string }[] = [];
      for (const g of GROUPS) {
        for (const w of g.words) {
          if (text.toUpperCase().includes(w.toUpperCase())) hits.push({ group: g.group, word: w });
        }
      }
      // 去重（同词同组只记一次）
      const seen = new Set<string>();
      const violations = hits.filter((h) => {
        const k = `${h.group}|${h.word}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return {
        note_id: x.noteId,
        title: x.title,
        cover_url: x.coverUrl,
        note_url: x.noteUrl,
        note_type: x.noteType,
        publish_time: x.publishTime,
        author_name: x.authorName,
        account_type: x.accountType,
        views: x.views,
        interaction: x.likes + x.collects + x.comments + x.shares,
        violations,
        violation_cnt: violations.length,
        state: violations.length ? 'violation' : 'ok',
      };
    });

    const want = query.state === 'ok' || query.state === 'violation' ? query.state : null;
    const filtered = want ? scanned.filter((x) => x.state === want) : scanned;
    const violationCnt = scanned.filter((x) => x.state === 'violation').length;
    return {
      start: dayKey08(start),
      end: dayKey08(end),
      total: scanned.length,
      violation_cnt: violationCnt,
      ok_cnt: scanned.length - violationCnt,
      groups: GROUPS.map((g) => ({ group: g.group, words: g.words.length })),
      list: filtered,
      scope_note: '合规检测=违禁词库规则扫描（标题+正文）；命中仅供参考，最终以平台审核为准',
    };
  }

  /** 特斯拉·区域/账号标签聚合双表（需求3 区域排行 + 需求8 区域数据分析共用） */
  async regionAnalysis(query: {
    brandId?: string;
    start?: string;
    end?: string;
    accountType?: string;
  }) {
    const end = query.end ? new Date(`${query.end}T23:59:59.999+08:00`) : new Date();
    const start = query.start
      ? new Date(`${query.start}T00:00:00.000+08:00`)
      : new Date(end.getTime() - 6 * 86400000);
    const brandId = query.brandId ? Number(query.brandId) : undefined;
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );

    const accountWhere: Prisma.KosAccountWhereInput = {
      ...(brandId ? { brandId } : {}),
      ...(query.accountType ? { accountType: query.accountType } : {}),
      status: 'enabled', // 账号基线=大区刷新对照表；禁用账号不进区域/标签聚合
    };
    const accounts = await this.prisma.kosAccount.findMany({
      where: accountWhere,
      select: {
        id: true,
        nickname: true,
        accountType: true,
        accountTag: true,
        regionName: true,
        storeName: true,
        authorId: true,
      },
    });
    const notes = brandId === 6
      ? []
      : await this.prisma.koxNote.findMany({
          where: {
            publishTime: { gte: start, lte: end },
            ...(brandId ? { brandId } : {}),
            // 仅统计基线账号（enabled）的笔记：非基线作者（对照表外新账号/官号）不进区域与标签聚合
            OR: [
              { accountId: { in: accounts.map((a) => a.id) } },
              { authorName: { in: accounts.map((a) => a.nickname) } },
            ],
          },
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
            pmInquiries: true,
            pmOpenings: true,
            pmLeads: true,
            isRtbAdver: true,
          },
        });

    // 笔记 → 账号键（accountId 优先，authorName 兜底）
    const idToAcc = new Map(accounts.map((a) => [a.id, a]));
    const nameToAcc = new Map(accounts.map((a) => [a.nickname, a]));
    interface Agg {
      kos: Set<number>;
      published: Set<number>;
      note_cnt: number;
      exposure: number;
      view: number;
      interaction: number;
      ces: number;
      pm_inquiries: number;
      pm_openings: number;
      pm_leads: number;
      organic_leads: number;
    }
    const newAgg = (): Agg => ({
      kos: new Set(),
      published: new Set(),
      note_cnt: 0,
      exposure: 0,
      view: 0,
      interaction: 0,
      ces: 0,
      pm_inquiries: 0,
      pm_openings: 0,
      pm_leads: 0,
      organic_leads: 0,
    });
    const groups = new Map<string, Agg>();
    const tagGroups = new Map<string, Agg>();
    const bucketOf = (m: Map<string, Agg>, key: string) => {
      let g = m.get(key);
      if (!g) {
        g = newAgg();
        m.set(key, g);
      }
      return g;
    };
    // 账号先入桶（未发布账号也计入 KOS 数）；区域/标签两套分桶
    const regionOf = (a: (typeof accounts)[number]) =>
      a.regionName ?? a.storeName ?? '未知区域';
    const tagOf = (a: (typeof accounts)[number]) => a.accountTag ?? '未标签';
    for (const a of accounts) {
      bucketOf(groups, regionOf(a)).kos.add(a.id);
      bucketOf(tagGroups, tagOf(a)).kos.add(a.id);
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    if (brandId === 6) {
      // 特斯拉口径（客户指定，2026-10）：
      // 笔记数量/有发布 = 聚光「商业内容管理」逐笔记（A，notePublishTime∈窗口去重；归属=noteId→KoxNote.accountId 优先、
      // authorName→基线昵称兜底，未匹配不入桶）；
      // 曝光/阅读/互动 = 专业号「数据中心-员工数据」（E，dateType=4 逐日求和优先、三档快照回退）→ 基线账号大区/标签分桶；
      // 私信三数 = 获客工具统计（G，与账号表现分析同口径）
      const contentNotes = await this.prisma.koxContentNoteDaily.findMany({
        where: { brandId: 6, day: { gte: start, lte: end } },
        select: {
          noteId: true, authorName: true, notePublishTime: true,
        },
      });
      const noteIds = [...new Set(contentNotes.map((c) => c.noteId))];
      const noteAccId = new Map<string, number | null>();
      for (let i = 0; i < noteIds.length; i += 500) {
        const chunk = noteIds.slice(i, i + 500);
        const metaRows = await this.prisma.koxNote.findMany({
          where: { brandId: 6, noteId: { in: chunk } },
          select: { noteId: true, accountId: true },
        });
        for (const m of metaRows) noteAccId.set(m.noteId, m.accountId);
      }
      const winStartDay = dayKey08(start);
      const winEndDay = dayKey08(end);
      const authorOf = new Map<string, string | null>();
      const publishedNotes = new Set<string>();
      for (const c of contentNotes) {
        if (!authorOf.has(c.noteId)) authorOf.set(c.noteId, c.authorName);
        if (c.notePublishTime) {
          const pd = dayKey08(c.notePublishTime);
          if (pd >= winStartDay && pd <= winEndDay) publishedNotes.add(c.noteId);
        }
      }
      for (const noteId of publishedNotes) {
        const accId = noteAccId.get(noteId);
        const acc =
          (accId != null ? idToAcc.get(accId) : undefined) ??
          nameToAcc.get(authorOf.get(noteId) ?? '');
        if (!acc) continue; // 未匹配基线账号的笔记不入桶
        const g = bucketOf(groups, regionOf(acc));
        const tg = bucketOf(tagGroups, tagOf(acc));
        for (const bucket of [g, tg]) {
          bucket.published.add(acc.id);
          bucket.note_cnt += 1;
        }
      }
      // 曝光/阅读/互动：员工数据窗口（E）按账号→大区/标签分桶
      const proMatrix = await this.proMatrixSvc.proMatrix(6, start, end);
      if (proMatrix) {
        for (const s of proMatrix.rows) {
          const acc = s.nickName ? nameToAcc.get(s.nickName) : undefined;
          if (!acc) continue;
          const g = bucketOf(groups, regionOf(acc));
          const tg = bucketOf(tagGroups, tagOf(acc));
          for (const bucket of [g, tg]) {
            bucket.exposure += s.socImpCnt;
            bucket.view += s.socClickCnt;
            bucket.interaction += s.socEnageCnt;
          }
        }
      }
      // 私信进线/开口/留资 = 专业号「客户管理（旧版）获客工具统计」按日×归属账号求和（与账号表现分析同口径）
      const toolRows = await this.prisma.proClueToolStatDaily.findMany({
        where: { brandId: 6, day: { gte: start, lte: end }, belongUserId: { not: '' } },
        select: {
          belongUserId: true, consultUserCnt: true, msgChatUserCnt: true, msgLeadsUserCnt: true,
          serviceCardLeadsUserCnt: true, qwAddLeadsUserCnt: true, bookCompLeadsUserCnt: true,
          landingPageLeadsUserCnt: true, wechatLeadsUserCnt: true, appCardLeadsUserCnt: true,
          otherLeadsUserCnt: true,
        },
      });
      const accByAuthor = new Map(accounts.filter((a) => a.authorId).map((a) => [a.authorId, a]));
      const toolAgg = new Map<string, { enter: number; open: number; leads: number }>();
      for (const r of toolRows) {
        const cur = toolAgg.get(r.belongUserId) ?? { enter: 0, open: 0, leads: 0 };
        cur.enter += r.consultUserCnt;
        cur.open += r.msgChatUserCnt;
        cur.leads +=
          r.msgLeadsUserCnt + r.serviceCardLeadsUserCnt + r.qwAddLeadsUserCnt +
          r.bookCompLeadsUserCnt + r.landingPageLeadsUserCnt + r.wechatLeadsUserCnt +
          r.appCardLeadsUserCnt + r.otherLeadsUserCnt;
        toolAgg.set(r.belongUserId, cur);
      }
      for (const [belong, v] of toolAgg) {
        const acc = accByAuthor.get(belong);
        if (!acc) continue;
        const g = bucketOf(groups, regionOf(acc));
        const tg = bucketOf(tagGroups, tagOf(acc));
        for (const b of [g, tg]) {
          b.pm_inquiries += v.enter;
          b.pm_openings += v.open;
          b.pm_leads += v.leads;
        }
      }
    } else {
      for (const n of notes) {
        const acc = n.accountId != null ? idToAcc.get(n.accountId) : undefined;
        const byName = acc ?? (n.authorName ? nameToAcc.get(n.authorName) : undefined);
        const rKey = byName ? regionOf(byName) : '未匹配账号';
        const tKey = byName ? tagOf(byName) : '未标签';
        const g = bucketOf(groups, rKey);
        const tg = bucketOf(tagGroups, tKey);
        for (const bucket of [g, tg]) {
          if (byName) bucket.published.add(byName.id);
          bucket.note_cnt += 1;
          bucket.exposure += n.exposure;
          bucket.view += n.views;
          bucket.interaction += n.likes + n.comments + n.shares + n.collects;
          bucket.ces += calcCes(
            n.likes,
            n.collects,
            n.comments,
            n.shares,
            n.followCount,
          );
          bucket.pm_inquiries += n.pmInquiries;
          bucket.pm_openings += n.pmOpenings;
          bucket.pm_leads += n.pmLeads;
          if (n.isRtbAdver !== true) bucket.organic_leads += n.pmLeads;
        }
      }
    }

    const mapRow = ([name, g]: [string, Agg]) => {
      const kosCnt = g.kos.size;
      return {
        name,
        kos_cnt: kosCnt,
        published_cnt: g.published.size,
        unpublished_cnt: kosCnt - g.published.size,
        note_cnt: g.note_cnt,
        exposure_sum: g.exposure,
        view_sum: g.view,
        interaction_sum: g.interaction,
        ces_sum: g.ces,
        avg_notes: kosCnt ? r2(g.note_cnt / kosCnt) : 0,
        avg_exposure: g.note_cnt ? r2(g.exposure / g.note_cnt) : 0,
        avg_ces: g.note_cnt ? r2(g.ces / g.note_cnt) : 0,
        pm_inquiries: g.pm_inquiries,
        pm_openings: g.pm_openings,
        organic_leads: g.organic_leads,
        pm_leads: g.pm_leads,
      };
    };
    type RegionRow = ReturnType<typeof mapRow>;
    // 排序（客户指定 2026-10）：默认留资数从多到少；「全国」行恒置底
    const sortRows = (rows: RegionRow[]) =>
      rows.sort((a, b) => {
        if (a.name === '全国') return 1;
        if (b.name === '全国') return -1;
        return b.pm_leads - a.pm_leads || b.kos_cnt - a.kos_cnt;
      });

    return {
      start,
      end,
      days,
      metric_note:
        brandId === 6
          ? '笔记数量/有发布=聚光「商业内容管理」按发布时间窗口去重（A）；曝光/阅读/互动=专业号「数据中心-员工数据」按窗口取数（E，逐日求和优先/三档快照回退）；私信进线/开口/留资=客户管理（旧版）获客工具统计按日×账号求和（G，留资含全部组件）；区域/标签归属按 210 账号基线，未匹配不入表；排序默认留资数从多到少，「全国」置底'
          : '私信进线/开口/留资=笔记私信口径（含投流笔记）；自然留资=未投流笔记留资；CES=赞1+藏1+评4+享4+关注8',
      regions: sortRows([...groups.entries()].map(mapRow)),
      tags: sortRows([...tagGroups.entries()].map(mapRow)),
      tier_meta: KOS_TIERS.map((t) => ({
        key: t.key,
        label: t.label,
        min: t.min,
        color: t.color,
      })),
    };
  }

  /** 特斯拉·账号排行（留资分层排序，需求4；总览底部 mini 榜共用 metric 切换） */
  async accountRanking(query: {
    brandId?: string;
    start?: string;
    end?: string;
    accountType?: string;
    regionName?: string;
    tag?: string;
    accountTag?: string;
    keyword?: string;
    metric?: string;
    page?: string;
    page_size?: string;
  }) {
    const end = query.end ? new Date(`${query.end}T23:59:59.999+08:00`) : new Date();
    const start = query.start
      ? new Date(`${query.start}T00:00:00.000+08:00`)
      : new Date(end.getTime() - 6 * 86400000);
    const brandId = query.brandId ? Number(query.brandId) : undefined;
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.page_size ?? 20) || 20));

    const accountWhere: Prisma.KosAccountWhereInput = {
      ...(brandId ? { brandId } : {}),
      ...(query.accountType ? { accountType: query.accountType } : {}),
      ...(query.regionName ? { regionName: query.regionName } : {}),
      ...(query.tag || query.accountTag
        ? { accountTag: query.tag || query.accountTag }
        : {}),
      ...(query.keyword
        ? { nickname: { contains: query.keyword, mode: 'insensitive' } }
        : {}),
      // 账号基线=大区刷新对照表；账号表现分析与总览口径一致（192 户）
      status: 'enabled',
    };
    const accounts = await this.prisma.kosAccount.findMany({
      where: accountWhere,
      select: {
        id: true,
        authorId: true,
        nickname: true,
        avatar: true,
        accountType: true,
        accountTag: true,
        regionName: true,
        areaName: true,
        storeName: true,
        storeCode: true,
        noteQuality: true,
        fans: true,
        authorUrl: true,
      },
    });

    // 账号表现分析口径（brand6）：内容指标=专业号员工矩阵窗口快照；进线/开口/留资=专业号「线索经营」按归属账号聚合（KOS-only 按客户去重）
    // KoxNote 笔记口径弃用（星火 partner 通道停更）；其他品牌维持星火笔记 + 乐允投放报表口径
    let metric_source = brandId === 6 ? 'pro_staff' : 'spark_notes';
    const notes = brandId === 6
      ? []
      : await this.prisma.koxNote.findMany({
      where: {
        publishTime: { gte: start, lte: end },
        ...(brandId ? { brandId } : {}),
      },
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
        pmInquiries: true,
        pmOpenings: true,
        pmLeads: true,
      },
    });

    interface AccAgg {
      item_cnt: number;
      exposure: number;
      view: number;
      interaction: number;
      likes: number;
      collects: number;
      comments: number;
      shares: number;
      ces: number;
      fans_gained: number;
      pm_inquiries: number;
      pm_openings: number;
      pm_leads: number;
    }
    const aggById = new Map<number, AccAgg>();
    const idSet = new Set(accounts.map((a) => a.id));
    const blank = (): AccAgg => ({
      item_cnt: 0,
      exposure: 0,
      view: 0,
      interaction: 0,
      likes: 0,
      collects: 0,
      comments: 0,
      shares: 0,
      ces: 0,
      fans_gained: 0,
      pm_inquiries: 0,
      pm_openings: 0,
      pm_leads: 0,
    });
    const bump = (accountId: number, fn: (a: AccAgg) => void) => {
      let cur = aggById.get(accountId);
      if (!cur) {
        cur = blank();
        aggById.set(accountId, cur);
      }
      fn(cur);
    };
    // 员工矩阵/笔记聚合前的公共映射
    const nameToId = new Map(accounts.map((a) => [a.nickname, a.id]));
    // 账号表现分析口径（客户确认）：
    // ①发布数 = 聚光「商业内容管理」逐笔记×逐日（时段发布口径：窗口内发布的员工笔记数）
    //   归属：noteId→KoxNote.accountId 优先、authorName→基线昵称兜底；未匹配不入统计
    // ②曝光/阅读（点击）/互动 = 专业号「数据中心-员工数据」窗口快照（socImpCnt/socClickCnt/socEnageCnt）
    // ③私信三数 = 专业号「客户管理（旧版）获客工具统计」（下方 toolRows 块）
    if (brandId === 6) {
      const contentNotes = await this.prisma.koxContentNoteDaily.findMany({
        where: { brandId: 6, day: { gte: start, lte: end } },
        select: {
          noteId: true,
          authorName: true,
          notePublishTime: true,
        },
      });
      const cAcc = new Map<string, number | null>();
      const cIds = [...new Set(contentNotes.map((c) => c.noteId))];
      for (let i = 0; i < cIds.length; i += 500) {
        const chunk = cIds.slice(i, i + 500);
        const metaRows = await this.prisma.koxNote.findMany({
          where: { brandId: 6, noteId: { in: chunk } },
          select: { noteId: true, accountId: true },
        });
        for (const m of metaRows) cAcc.set(m.noteId, m.accountId);
      }
      const idToAccR = new Map(accounts.map((a) => [a.id, a]));
      const wStart = dayKey08(start);
      const wEnd = dayKey08(end);
      const cAuthor = new Map<string, string | null>();
      const cPublished = new Set<string>();
      for (const c of contentNotes) {
        if (!cAuthor.has(c.noteId)) cAuthor.set(c.noteId, c.authorName);
        if (c.notePublishTime) {
          const pd = dayKey08(c.notePublishTime);
          if (pd >= wStart && pd <= wEnd) cPublished.add(c.noteId);
        }
      }
      for (const noteId of cPublished) {
        const accIdFromNote = cAcc.get(noteId);
        const accIdResolved =
          accIdFromNote != null ? accIdFromNote : nameToId.get(cAuthor.get(noteId) ?? '') ?? null;
        const acc = accIdResolved != null ? idToAccR.get(accIdResolved) : undefined;
        if (!acc) continue;
        bump(acc.id, (a) => {
          a.item_cnt += 1;
        });
      }
      // 曝光/阅读（点击）/互动：专业号员工数据窗口（dateType=4 逐日求和优先、三档快照回退）
      const proMatrix = await this.proMatrixSvc.proMatrix(6, start, end);
      if (proMatrix) {
        for (const s of proMatrix.rows) {
          const accId = s.nickName ? nameToId.get(s.nickName) : null;
          if (accId == null) continue;
          bump(accId, (a) => {
            a.exposure += s.socImpCnt;
            a.view += s.socClickCnt;
            a.interaction += s.socEnageCnt;
          });
        }
        metric_source = `juguang_content_publish + pro_staff_${proMatrix.source}(dateType=${proMatrix.dateType}, statDate=${dayKey08(proMatrix.statDate)})`;
      } else {
        metric_source = 'juguang_content_publish + pro_staff(no_partition)';
      }
    }
    for (const n of notes) {
      let accId: number | null = null;
      if (n.accountId != null && idSet.has(n.accountId)) accId = n.accountId;
      else if (n.authorName) accId = nameToId.get(n.authorName) ?? null;
      if (accId == null) continue;
      bump(accId, (a) => {
        a.item_cnt += 1;
        a.exposure += n.exposure;
        a.view += n.views;
        a.interaction += n.likes + n.comments + n.shares + n.collects;
        a.pm_inquiries += n.pmInquiries;
        a.pm_openings += n.pmOpenings;
        a.pm_leads += n.pmLeads;
        a.likes += n.likes;
        a.collects += n.collects;
        a.comments += n.comments;
        a.shares += n.shares;
        a.fans_gained += n.followCount;
        a.ces += calcCes(n.likes, n.collects, n.comments, n.shares, n.followCount);
      });
    }

    // 私信进线/开口/留资：brand6 = 专业号「客户管理（旧版）获客工具统计」按日×归属账号求和（客户指定口径，2026-10-08 起）
    // 留资 = 私信留资+服务卡+企微+预约组件+落地页+个微复制+交易卡+其他；官方账号自然排除（仅基线账号有行）；其他品牌走乐允投放报表
    if (brandId === 6) {
        const toolRows = await this.prisma.proClueToolStatDaily.findMany({
          where: { brandId: 6, day: { gte: start, lte: end }, belongUserId: { not: '' } },
          select: {
            belongUserId: true, consultUserCnt: true, msgChatUserCnt: true, msgLeadsUserCnt: true,
            serviceCardLeadsUserCnt: true, qwAddLeadsUserCnt: true, bookCompLeadsUserCnt: true,
            landingPageLeadsUserCnt: true, wechatLeadsUserCnt: true, appCardLeadsUserCnt: true,
            otherLeadsUserCnt: true,
          },
        });
        const authorToId = new Map(
          accounts.filter((a) => a.authorId).map((a) => [a.authorId, a.id]),
        );
        const toolAgg = new Map<string, { enter: number; open: number; leads: number }>();
        for (const r of toolRows) {
          const cur = toolAgg.get(r.belongUserId) ?? { enter: 0, open: 0, leads: 0 };
          cur.enter += r.consultUserCnt;
          cur.open += r.msgChatUserCnt;
          cur.leads +=
            r.msgLeadsUserCnt + r.serviceCardLeadsUserCnt + r.qwAddLeadsUserCnt +
            r.bookCompLeadsUserCnt + r.landingPageLeadsUserCnt + r.wechatLeadsUserCnt +
            r.appCardLeadsUserCnt + r.otherLeadsUserCnt;
          toolAgg.set(r.belongUserId, cur);
        }
        let clueHit = 0;
        for (const [belong, v] of toolAgg) {
          const accId = authorToId.get(belong);
          if (accId == null || !idSet.has(accId)) continue;
          clueHit += 1;
          bump(accId, (a) => {
            a.pm_inquiries = v.enter;
            a.pm_openings = v.open;
            a.pm_leads = v.leads;
          });
        }
        if (clueHit) metric_source += '+pro_clue_tool_stat';

      // 点赞/收藏/评论/分享/CES：聚光「商业内容管理」按笔记累计口径（KoxNote 行由
      // tools/spark/sync-juguang-content.cjs 经 partner→聚光 链路覆盖式维护，不随日期窗口变化）
      const cumNotes = await this.prisma.koxNote.findMany({
        where: { brandId: 6 },
        select: {
          accountId: true,
          authorName: true,
          likes: true,
          collects: true,
          comments: true,
          shares: true,
          followCount: true,
        },
      });
      const cumAgg = new Map<
        number,
        { likes: number; collects: number; comments: number; shares: number; ces: number }
      >();
      for (const n of cumNotes) {
        const accId =
          n.accountId != null && idSet.has(n.accountId)
            ? n.accountId
            : n.authorName
              ? nameToId.get(n.authorName) ?? null
              : null;
        if (accId == null) continue;
        const cur = cumAgg.get(accId) ?? { likes: 0, collects: 0, comments: 0, shares: 0, ces: 0 };
        cur.likes += n.likes;
        cur.collects += n.collects;
        cur.comments += n.comments;
        cur.shares += n.shares;
        cur.ces += calcCes(n.likes, n.collects, n.comments, n.shares, n.followCount);
        cumAgg.set(accId, cur);
      }
      for (const [accId, v] of cumAgg) {
        if (!idSet.has(accId)) continue;
        bump(accId, (a) => {
          a.likes = v.likes;
          a.collects = v.collects;
          a.comments = v.comments;
          a.shares = v.shares;
          a.ces = v.ces;
        });
      }
      if (cumAgg.size) metric_source += '+notes_cum_likes';
    } else {
      const campRows = await this.prisma.koxCampaignDailyStat.findMany({
        where: {
          brandId,
          accountKind: 'kos_author',
          statDate: { gte: start, lte: end },
        },
        select: { brandUserName: true, messageConsult: true, msgChatUserCnt: true, msgLeadsNum: true },
      });
      const campAgg = new Map<number, { inq: number; open: number; leads: number }>();
      for (const r of campRows) {
        const accId = r.brandUserName ? nameToId.get(r.brandUserName) : null;
        if (accId == null || !idSet.has(accId)) continue;
        const cur = campAgg.get(accId) ?? { inq: 0, open: 0, leads: 0 };
        cur.inq += r.messageConsult;
        cur.open += r.msgChatUserCnt;
        cur.leads += r.msgLeadsNum;
        campAgg.set(accId, cur);
      }
      for (const [accId, v] of campAgg) {
        bump(accId, (a) => {
          a.pm_inquiries = v.inq;
          a.pm_openings = v.open;
          a.pm_leads = v.leads;
        });
      }
      if (campRows.length) {
        metric_source += '+leyoon_daily';
      }
    }

    const rows = accounts.map((a) => {
      const g = aggById.get(a.id) ?? blank();
      const tier: KosTierMeta = classifyTier(g.pm_leads, days);
      return {
        account_id: a.id,
        author_id: a.authorId,
        nickname: a.nickname,
        avatar: a.avatar,
        account_type: a.accountType,
        account_tag: a.accountTag,
        region_name: a.regionName,
        province_name: (a.areaName ?? '').split('·')[0] || null,
        store_name: a.storeName,
        store_code: a.storeCode,
        note_quality: a.noteQuality,
        fans: a.fans,
        author_url: a.authorUrl,
        item_cnt: g.item_cnt,
        exposure_sum: g.exposure,
        view_sum: g.view,
        interaction_sum: g.interaction,
        likes_sum: g.likes,
        collects_sum: g.collects,
        comments_sum: g.comments,
        shares_sum: g.shares,
        ces: g.ces,
        fans_gained: g.fans_gained,
        fans_rate: g.view ? Math.round((g.fans_gained / g.view) * 10000) / 100 : 0,
        pm_inquiries: g.pm_inquiries,
        pm_openings: g.pm_openings,
        pm_leads: g.pm_leads,
        total_leads: null,
        service_card_leads: null,
        wecom_copy_leads: null,
        weekly_leads: Math.round((g.pm_leads / (days / 7)) * 100) / 100,
        tier_key: tier.key,
        tier_label: tier.label,
        tier_rank: tier.rank,
        tier_color: tier.color,
      };
    });

    const METRICS = [
      'pm_leads',
      'exposure_sum',
      'view_sum',
      'interaction_sum',
      'ces',
      'item_cnt',
    ] as const;
    const metric = (METRICS as readonly string[]).includes(query.metric ?? '')
      ? (query.metric as (typeof METRICS)[number])
      : 'pm_leads';
    // 排序（客户指定 2026-10）：所有排行默认「留资数从多到少」纯降序；切换其他指标时按所选指标降序
    rows.sort((a, b) =>
      metric === 'pm_leads'
        ? b.pm_leads - a.pm_leads || a.tier_rank - b.tier_rank
        : b[metric] - a[metric] || b.pm_leads - a.pm_leads,
    );

    const tierStat = KOS_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      color: t.color,
      count: rows.filter((r) => r.tier_key === t.key).length,
    }));

    return {
      start,
      end,
      days,
      metric,
      metric_source,
      total: rows.length,
      page,
      page_size: pageSize,
      tier_stat: tierStat,
      region_facets: [
        ...new Set(
          accounts.map((a) => a.regionName).filter((r): r is string => !!r),
        ),
      ].sort(),
      tag_facets: [
        ...new Set(
          accounts.map((a) => a.accountTag).filter((t): t is string => !!t),
        ),
      ],
      metric_note: metric_source.startsWith('weekly_snapshot')
        ? '本周数据为客户周度表权威口径快照（总留资=私信留资+服务卡留资+个微复制留资；消耗=笔记投流消耗）；分层为周表留资分层'
        : metric_source.includes('leyoon_daily')
          ? `私信进线/开口/留资=乐允投放报表按所选区间逐日聚合（数据自 2026-01-07 起，随区间真实变化）${metric_source.includes('pro_staff') ? '；内容指标=专业号窗口快照' : '；内容指标=笔记周期累计口径'}；分层=周度留资折算`
            : metric_source.startsWith('pro_staff')
              ? `内容指标=专业号员工矩阵窗口快照（发布/曝光/阅读/互动，快照 ${metric_source.match(/statDate=([\d-]+)/)?.[1] || '无匹配分区'}，每日自动同步）；进线/开口/留资=客户管理获客工具统计按日×账号求和（留资含私信+服务卡+企微+落地页+个微复制等全部组件）；赞/藏/评/CES=聚光「商业内容管理」按笔记累计口径；分层=周度留资折算`
            : '留资=笔记私信留资（含投流）；分层=S级头部按月度留资≥200（任意周期归一月度）；其余头部/高潜/腰部/尾部按周度留资折算',
      list: rows.slice((page - 1) * pageSize, page * pageSize),
    };
  }

  /** 东风·经销商快照排行（旧系统导出聚合，真实完成度/得分） */
  async dealerSnapshot(query: { brandId?: string; statMonth?: string; mode?: string }) {
    if (query.mode === 'live') return this.dealerLive(query);
    const brandId = query.brandId ? Number(query.brandId) : 7;
    const months = await this.prisma.koxDealerSnapshot.findMany({
      where: { brandId },
      distinct: ['statMonth'],
      select: { statMonth: true },
      orderBy: { statMonth: 'desc' },
    });
    const statMonth = query.statMonth || months[0]?.statMonth || undefined;
    const rows = await this.prisma.koxDealerSnapshot.findMany({
      where: { brandId, ...(statMonth ? { statMonth } : {}) },
      orderBy: { score: 'desc' },
    });
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const tierCount: Record<string, number> = { 头部: 0, 腰部: 0, 尾部: 0, 沉默: 0 };
    for (const r of rows) {
      const t = r.tier ?? '沉默';
      tierCount[t] = (tierCount[t] ?? 0) + 1;
    }
    const wavg = (f: (r: (typeof rows)[number]) => number | null) => {
      const valid = rows.filter((r) => f(r) != null);
      const total = valid.reduce((s, r) => s + r.accountCnt, 0);
      return total ? Math.round((valid.reduce((s, r) => s + (f(r) ?? 0) * r.accountCnt, 0) / total) * 10) / 10 : 0;
    };
    return {
      stat_month: statMonth ?? null,
      stat_months: months.map((m) => m.statMonth).filter((m): m is string => !!m),
      tier_stat: tierCount,
      summary: {
        dealer_cnt: rows.length,
        account_cnt: sum((r) => r.accountCnt),
        publish_cnt: sum((r) => r.publishCnt),
        content_pct: wavg((r) => (r.contentPct != null ? Number(r.contentPct) : null)),
        exposure: sum((r) => r.exposure),
        inquiries: sum((r) => r.inquiries),
        openings: sum((r) => r.openings),
        leads: sum((r) => r.leads),
        deals: sum((r) => r.deals),
        avg_exposure_per_note: sum((r) => r.publishCnt)
          ? Math.round((sum((r) => r.exposure) / sum((r) => r.publishCnt)) * 10) / 10
          : 0,
        interaction_rate: 0,
      },
      list: rows.map((r, i) => ({
        rank: i + 1,
        dealer_name: r.dealerName,
        region_name: r.regionName,
        city_name: r.cityName,
        tier: r.tier,
        score: r.score != null ? Number(r.score) : 0,
        account_cnt: r.accountCnt,
        publish_cnt: r.publishCnt,
        content_pct: r.contentPct != null ? Number(r.contentPct) : 0,
        exposure: r.exposure,
        exposure_pct: r.exposurePct != null ? Number(r.exposurePct) : 0,
        inquiries: r.inquiries,
        openings: r.openings,
        leads: r.leads,
        leads_pct: r.leadsPct != null ? Number(r.leadsPct) : 0,
        deals: r.deals,
        deals_pct: r.dealsPct != null ? Number(r.dealsPct) : 0,
      })),
    };
  }

  /**
   * 经销商排行·实时聚合（星火笔记 × 门店账号，按自然月窗口）
   * 分层（月度留资）：头部 ≥20 ｜ 腰部 5–19 ｜ 尾部 1–4 ｜ 沉默 0
   * 综合得分 = 内容分（有发布账号占比）×40% + 留资分（店留资 / 最高店 ×100）×60%
   * 曝光/留资/成交完成度无目标值口径 → null（前端显示 —）
   */
  private async dealerLive(query: { brandId?: string; statMonth?: string }) {
    const brandId = query.brandId ? Number(query.brandId) : 7;
    const now = new Date();
    const bj = new Date(now.getTime() + 8 * 3600 * 1000);
    const month =
      query.statMonth ??
      `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}`;
    const start = new Date(`${month}-01T00:00:00.000+08:00`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const months: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(start);
      d.setUTCMonth(d.getUTCMonth() - i);
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    const accounts = await this.prisma.kosAccount.findMany({
      where: { brandId, status: 'enabled' },
      select: { id: true, nickname: true, storeName: true, regionName: true, areaName: true },
    });
    const grouped = await this.prisma.koxNote.groupBy({
      by: ['accountId'],
      where: { brandId, publishTime: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: {
        exposure: true,
        views: true,
        likes: true,
        comments: true,
        collects: true,
        shares: true,
        pmInquiries: true,
        pmOpenings: true,
        pmLeads: true,
      },
    });
    const noteMap = new Map(grouped.map((g) => [g.accountId, g]));

    const dealers = new Map<
      string,
      {
        region: string | null; city: string | null; accounts: number; published: number;
        publishCnt: number; exposure: number; viewSum: number; interaction: number;
        inquiries: number; openings: number; leads: number;
      }
    >();
    for (const a of accounts) {
      const name = a.storeName || a.nickname;
      const d =
        dealers.get(name) ??
        {
          region: a.regionName, city: a.areaName, accounts: 0, published: 0,
          publishCnt: 0, exposure: 0, viewSum: 0, interaction: 0,
          inquiries: 0, openings: 0, leads: 0,
        };
      d.accounts += 1;
      const g = noteMap.get(a.id);
      if (g) {
        d.published += 1;
        d.publishCnt += g._count._all;
        d.exposure += g._sum.exposure ?? 0;
        d.viewSum += g._sum.views ?? 0;
        d.interaction += (g._sum.likes ?? 0) + (g._sum.comments ?? 0) + (g._sum.collects ?? 0) + (g._sum.shares ?? 0);
        d.inquiries += g._sum.pmInquiries ?? 0;
        d.openings += g._sum.pmOpenings ?? 0;
        d.leads += g._sum.pmLeads ?? 0;
      }
      dealers.set(name, d);
    }

    const maxLeads = Math.max(1, ...[...dealers.values()].map((d) => d.leads));
    const tierOf = (leads: number) => (leads >= 20 ? '头部' : leads >= 5 ? '腰部' : leads >= 1 ? '尾部' : '沉默');
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const rows = [...dealers.entries()]
      .map(([name, d]) => {
        const contentPct = d.accounts ? Math.round((d.published / d.accounts) * 1000) / 10 : 0;
        const leadsScore = (d.leads / maxLeads) * 100;
        const score = r1(contentPct * 0.4 + leadsScore * 0.6);
        return {
          dealer_name: name,
          region_name: d.region,
          city_name: d.city,
          tier: tierOf(d.leads),
          score,
          account_cnt: d.accounts,
          publish_cnt: d.publishCnt,
          content_pct: contentPct,
          exposure: d.exposure,
          exposure_pct: null,
          inquiries: d.inquiries,
          openings: d.openings,
          leads: d.leads,
          leads_pct: null,
          deals: null,
          deals_pct: null,
        };
      })
      .sort((a, b) => b.score - a.score);

    const tierCount: Record<string, number> = { 头部: 0, 腰部: 0, 尾部: 0, 沉默: 0 };
    for (const r of rows) tierCount[r.tier] += 1;
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const totalAccounts = sum((r) => r.account_cnt);
    const totalPublish = sum((r) => r.publish_cnt);
    const wavgContent = totalAccounts
      ? r1(sum((r) => r.content_pct * r.account_cnt) / totalAccounts)
      : 0;

    return {
      mode: 'live',
      stat_month: month,
      stat_months: months,
      tier_stat: tierCount,
      summary: {
        dealer_cnt: rows.length,
        account_cnt: totalAccounts,
        publish_cnt: totalPublish,
        content_pct: wavgContent,
        exposure: sum((r) => r.exposure),
        inquiries: sum((r) => r.inquiries),
        openings: sum((r) => r.openings),
        leads: sum((r) => r.leads),
        deals: 0,
        avg_exposure_per_note: totalPublish ? r1(sum((r) => r.exposure) / totalPublish) : 0,
        interaction_rate: 0,
      },
      list: rows.map((r, i) => ({ rank: i + 1, ...r })),
    };
  }

  /** 东风·区域投放：live=星火组织级真实派生（单行「全国」，大区拆分星火暂不支持）；缺省=旧系统导出快照 */
  async regionAdSnapshot(query: { brandId?: string; mode?: string; start?: string; end?: string }) {
    const brandId = Number(query.brandId ?? 7) || 7;
    if (query.mode === 'live') {
      const end = query.end
        ? new Date(`${query.end}T23:59:59.999+08:00`)
        : new Date();
      const start = query.start
        ? new Date(`${query.start}T00:00:00.000+08:00`)
        : new Date(end.getTime() - 29 * 86400000);
      const g = await this.prisma.koxCampaignDailyStat.aggregate({
        where: { brandId, statDate: { gte: start, lte: end } },
        _sum: { fee: true, messageConsult: true, msgChatUserCnt: true, msgLeadsNum: true },
      });
      const fee = Number(g._sum.fee ?? 0);
      const enter = g._sum.messageConsult ?? 0;
      const open = g._sum.msgChatUserCnt ?? 0;
      const leads = g._sum.msgLeadsNum ?? 0;
      const r2v = (v: number) => Math.round(v * 100) / 100;
      return {
        mode: 'live',
        ad_source: 'spark_campaign',
        metric_note: '合计=星火聚光投流组织级数据（T+1）；星火暂不支持按大区拆分投放，大区维度待开通后展示',
        list: [
          {
            region: '全国',
            fee,
            account_cnt: null,
            note_cnt: null,
            reply_rate: null,
            inquiries: enter,
            openings: open,
            leads,
            open_rate: enter ? r2v((open / enter) * 100) : null,
            open_lead_rate: enter ? r2v((leads / enter) * 100) : null,
            inquiry_cost: enter ? r2v(fee / enter) : null,
            open_cost: open ? r2v(fee / open) : null,
            lead_cost: leads ? r2v(fee / leads) : null,
          },
        ],
      };
    }
    const rows = await this.prisma.koxRegionAdSnapshot.findMany({
      where: { brandId },
      orderBy: { fee: 'desc' },
    });
    return {
      list: rows.map((r, i) => ({
        rank: i + 1,
        region: r.regionName,
        fee: Number(r.fee),
        account_cnt: r.accountCnt,
        note_cnt: r.noteCnt,
        reply_rate: r.replyRate != null ? Number(r.replyRate) : null,
        inquiries: r.inquiries,
        openings: r.openings,
        leads: r.leads,
        open_rate: r.openRate != null ? Number(r.openRate) : null,
        open_lead_rate: r.openLeadRate != null ? Number(r.openLeadRate) : null,
        inquiry_cost: r.inquiryCost != null ? Number(r.inquiryCost) : null,
        open_cost: r.openCost != null ? Number(r.openCost) : null,
        lead_cost: r.leadCost != null ? Number(r.leadCost) : null,
      })),
      metric_note: '数据源=旧系统导出快照（投放明细为账号维度 TOP20 汇总口径）',
    };
  }

  async importAccounts(rows: ImportAccountRow[], dryRun = false) {
    let added = 0;
    let updated = 0;
    const errors: { row: number; msg: string }[] = [];

    const clean = (v?: unknown) => {
      const s = (v ?? '').toString().trim();
      return s && s !== '无' ? s : null;
    };

    // 文件内 UID 去重：同一 UID 保留最后一行（最新信息为准）
    const byUid = new Map<string, { row: ImportAccountRow; rowNo: number }>();
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const authorId = (r.authorId ?? '').toString().trim();
      const rowNo = i + 2;
      if (!authorId) {
        errors.push({ row: rowNo, msg: '缺少账号UID' });
        continue;
      }
      byUid.set(authorId, { row: r, rowNo });
    }

    const classification: { authorId: string; action: 'create' | 'update' }[] = [];

    for (const [authorId, { row: r, rowNo }] of byUid) {
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
      const nickname = clean(r.nickname);
      const operatorName = clean(r.operatorName);
      const operatorMobile = clean(r.operatorMobile);
      const accountTag = clean(r.accountTag);
      const fansNum = Number(r.fans);

      // 仅写入 Excel 提供的非空字段（重叠账号不覆盖系统已有昵称/状态）
      const data: Record<string, unknown> = {};
      if (type) data.accountType = type;
      if (regionName) data.regionName = regionName;
      if (saleArea) data.saleArea = saleArea;
      if (area) data.areaName = area;
      if (storeName) data.storeName = storeName;
      const authorUrl = clean(r.authorUrl);
      if (authorUrl) data.authorUrl = authorUrl;
      if (operatorName) data.operatorName = operatorName;
      if (operatorMobile) data.operatorMobile = operatorMobile;
      if (accountTag) data.accountTag = accountTag;
      if (Number.isFinite(fansNum) && fansNum >= 0) data.fans = Math.round(fansNum);

      const existing = await this.prisma.kosAccount.findUnique({
        where: { authorId },
      });
      if (existing) {
        // 重叠：昵称仅在原为空时补
        if (!existing.nickname && nickname) data.nickname = nickname;
        classification.push({ authorId, action: 'update' });
        if (!dryRun) await this.prisma.kosAccount.update({ where: { authorId }, data });
        updated += 1;
      } else {
        // 新增：昵称 = Excel昵称 → 门店名 → UID
        data.nickname = nickname ?? storeName ?? authorId;
        data.accountType = type || 'KOS';
        data.platform = 'xhs';
        data.fans = data.fans ?? 0;
        classification.push({ authorId, action: 'create' });
        if (!dryRun) await this.prisma.kosAccount.create({ data: { authorId, ...data } as never });
        added += 1;
      }
    }

    return { total: rows.length, added, updated, errors, classification };
  }

  /**
   * KOS 运营进度总览（特斯拉，按账号拆分）：专业号员工快照 × 账号归属
   * 内容完成度 = 周度篇数/3；进线完成度 = 周度进线/5；综合得分 = 内容40% + 留资60%
   */
  async proStaffProgress(query: {
    brandId?: string;
    start?: string;
    end?: string;
    tag?: string;
    regionName?: string;
    keyword?: string;
  }) {
    const end = query.end ? new Date(`${query.end}T23:59:59.999+08:00`) : new Date();
    const start = query.start
      ? new Date(`${query.start}T00:00:00.000+08:00`)
      : new Date(end.getTime() - 6 * 86400000);
    const brandId = query.brandId ? Number(query.brandId) : 6;
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
    const weeklyNotesTarget = (3 * days) / 7;
    const weeklyEnterTarget = (5 * days) / 7;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const pct = (v: number, target: number) =>
      target > 0 ? Math.min(100, Math.round((v / target) * 100)) : 0;

    // 口径：整行内容指标 = 专业号员工矩阵窗口快照（发布/曝光/阅读/互动）；线索经营按归属账号三数
    // KoxNote 笔记口径弃用（星火 partner 通道停更，仅保留笔记级明细用途）
    // 账号基线=大区刷新对照表（192 户，与运营总览一致）
    const accountWhere: Prisma.KosAccountWhereInput = {
      ...(brandId ? { brandId } : {}),
      ...(query.tag ? { accountTag: query.tag } : {}),
      ...(query.regionName ? { regionName: query.regionName } : {}),
      ...(query.keyword
        ? { nickname: { contains: query.keyword, mode: 'insensitive' } }
        : {}),
      status: 'enabled',
    };
    const accounts = await this.prisma.kosAccount.findMany({
      where: accountWhere,
      select: {
        id: true,
        authorId: true,
        nickname: true,
        avatar: true,
        storeName: true,
        regionName: true,
        accountTag: true,
      },
    });
    const nameToAcc = new Map(accounts.map((a) => [a.nickname, a]));

    interface ProAgg {
      item_cnt: number;
      exposure_sum: number;
      click_sum: number;
      interaction_sum: number;
      pm_inquiries: number;
      pm_openings: number;
      pm_leads: number;
      fee: number;
    }
    const blank = (): ProAgg => ({
      item_cnt: 0, exposure_sum: 0, click_sum: 0, interaction_sum: 0,
      pm_inquiries: 0, pm_openings: 0, pm_leads: 0, fee: 0,
    });
    const agg = new Map<number, ProAgg>();
    const bump = (accId: number, fn: (a: ProAgg) => void) => {
      let cur = agg.get(accId);
      if (!cur) { cur = blank(); agg.set(accId, cur); }
      fn(cur);
    };

    // 内容指标（客户指定 2026-10）：
    // 发布数 = 聚光「商业内容管理」逐笔记（A，notePublishTime∈窗口去重；归属=noteId→KoxNote.accountId 优先、
    //   authorName→基线昵称兜底，未匹配不入统计）
    // 曝光/阅读/互动 = 专业号「数据中心-员工数据」（E，dateType=4 逐日求和优先、三档快照回退）
    const contentNotes = await this.prisma.koxContentNoteDaily.findMany({
      where: { brandId: 6, day: { gte: start, lte: end } },
      select: {
        noteId: true, authorName: true, notePublishTime: true,
      },
    });
    const cNoteIds = [...new Set(contentNotes.map((c) => c.noteId))];
    const cNoteAcc = new Map<string, number | null>();
    for (let i = 0; i < cNoteIds.length; i += 500) {
      const chunk = cNoteIds.slice(i, i + 500);
      const metaRows = await this.prisma.koxNote.findMany({
        where: { brandId: 6, noteId: { in: chunk } },
        select: { noteId: true, accountId: true },
      });
      for (const m of metaRows) cNoteAcc.set(m.noteId, m.accountId);
    }
    const idToAccLocal = new Map(accounts.map((a) => [a.id, a]));
    const winStartDayP = dayKey08(start);
    const winEndDayP = dayKey08(end);
    const cAuthor = new Map<string, string | null>();
    const cPublished = new Set<string>();
    for (const c of contentNotes) {
      if (!cAuthor.has(c.noteId)) cAuthor.set(c.noteId, c.authorName);
      if (c.notePublishTime) {
        const pd = dayKey08(c.notePublishTime);
        if (pd >= winStartDayP && pd <= winEndDayP) cPublished.add(c.noteId);
      }
    }
    for (const noteId of cPublished) {
      const accId = cNoteAcc.get(noteId);
      const acc =
        (accId != null ? idToAccLocal.get(accId) : undefined) ??
        nameToAcc.get(cAuthor.get(noteId) ?? '');
      if (!acc) continue;
      bump(acc.id, (a) => {
        a.item_cnt += 1;
      });
    }
    // 曝光/阅读/互动：员工数据窗口（E）按账号聚合
    const proMatrixP = await this.proMatrixSvc.proMatrix(brandId, start, end);
    if (proMatrixP) {
      for (const s of proMatrixP.rows) {
        const acc = s.nickName ? nameToAcc.get(s.nickName) : null;
        if (!acc) continue;
        bump(acc.id, (a) => {
          a.exposure_sum += s.socImpCnt;
          a.click_sum += s.socClickCnt;
          a.interaction_sum += s.socEnageCnt;
        });
      }
    }
    // 进线/开口/留资：专业号「客户管理（旧版）获客工具统计」按日×归属账号求和（G，与账号表现分析/区域数据同口径）
    const toolRowsP = await this.prisma.proClueToolStatDaily.findMany({
      where: { brandId, day: { gte: start, lte: end }, belongUserId: { not: '' } },
      select: {
        belongUserId: true, consultUserCnt: true, msgChatUserCnt: true, msgLeadsUserCnt: true,
        serviceCardLeadsUserCnt: true, qwAddLeadsUserCnt: true, bookCompLeadsUserCnt: true,
        landingPageLeadsUserCnt: true, wechatLeadsUserCnt: true, appCardLeadsUserCnt: true,
        otherLeadsUserCnt: true,
      },
    });
    const authorToIdPro = new Map(
      accounts.filter((a) => a.authorId).map((a) => [a.authorId, a.id]),
    );
    const toolAggP = new Map<string, { enter: number; open: number; leads: number }>();
    for (const r of toolRowsP) {
      const cur = toolAggP.get(r.belongUserId) ?? { enter: 0, open: 0, leads: 0 };
      cur.enter += r.consultUserCnt;
      cur.open += r.msgChatUserCnt;
      cur.leads +=
        r.msgLeadsUserCnt + r.serviceCardLeadsUserCnt + r.qwAddLeadsUserCnt +
        r.bookCompLeadsUserCnt + r.landingPageLeadsUserCnt + r.wechatLeadsUserCnt +
        r.appCardLeadsUserCnt + r.otherLeadsUserCnt;
      toolAggP.set(r.belongUserId, cur);
    }
    for (const [belong, v] of toolAggP) {
      const accId = authorToIdPro.get(belong);
      if (accId == null) continue;
      bump(accId, (a) => {
        a.pm_inquiries = v.enter;
        a.pm_openings = v.open;
        a.pm_leads = v.leads;
      });
    }

    // 投流消耗（rtb_income）仍取乐允投放报表逐日（partner 通道口径）
    const campFeeRows = await this.prisma.koxCampaignDailyStat.findMany({
      where: {
        brandId,
        accountKind: 'kos_author',
        statDate: { gte: start, lte: end },
      },
      select: { brandUserName: true, fee: true },
    });
    for (const r of campFeeRows) {
      const acc = r.brandUserName ? nameToAcc.get(r.brandUserName) : null;
      if (!acc) continue;
      bump(acc.id, (a) => {
        a.fee = Math.round((a.fee + Number(r.fee)) * 100) / 100;
      });
    }

    let rows = accounts.map((a) => {
      const g = agg.get(a.id) ?? blank();
      const contentPct = pct(g.item_cnt, weeklyNotesTarget);
      const enterPct = pct(g.pm_inquiries, weeklyEnterTarget);
      const leadsPct = pct(g.pm_leads, weeklyEnterTarget);
      const tier = classifyTier(g.pm_leads, days);
      const ctr = g.exposure_sum ? r2((g.click_sum / g.exposure_sum) * 100) : 0;
      return {
        user_id: String(a.id),
        nickname: a.nickname,
        avatar: a.avatar,
        real_name: null,
        store_name: a.storeName ?? '未关联门店',
        region: a.regionName ?? '-',
        account_tag: a.accountTag ?? null,
        tier_key: tier.key,
        tier_label: tier.label,
        tier_color: tier.color,
        item_cnt: g.item_cnt,
        content_pct: contentPct,
        exposure_sum: g.exposure_sum,
        click_sum: g.click_sum,
        ctr,
        interaction_sum: g.interaction_sum,
        pm_leads: g.pm_leads,
        pm_inquiries: g.pm_inquiries,
        enter_pct: enterPct,
        pm_openings: g.pm_openings,
        leads_pct: leadsPct,
        rtb_income: g.fee,
        score: Math.round(contentPct * 0.4 + leadsPct * 0.6),
      };
    });

    // 排序（客户指定 2026-10）：默认留资数从多到少（同分按综合得分）
    rows.sort((a, b) => b.pm_leads - a.pm_leads || b.score - a.score || b.item_cnt - a.item_cnt);

    const tierStat = KOS_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      color: t.color,
      count: rows.filter((r) => r.tier_key === t.key).length,
    }));
    return {
      days,
      date_type: null,
      stat_date: null,
      caliber: 'juguang_content_publish+pro_staff_matrix+pro_clue_tool_stat',
      metric_note:
        '发布数=聚光「商业内容管理」按发布时间窗口去重（A）；曝光/阅读/互动=专业号「数据中心-员工数据」按窗口取数（E，逐日求和优先/三档快照回退）；进线/开口/留资=客户管理（旧版）获客工具统计按日×账号求和（G）；排序默认留资数从多到少',
      weekly_notes_target: weeklyNotesTarget,
      weekly_enter_target: weeklyEnterTarget,
      total: rows.length,
      rows,
      tier_stat: tierStat,
    };
  }
}
