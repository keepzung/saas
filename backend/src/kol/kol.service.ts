import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthorsListDto,
  CollectDto,
  ReviewActionDto,
  UpdateCreatorDto,
} from './dto/kol.dto';

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v));
  return Number.isNaN(n) ? 0 : n;
};

const REGION_TREE = [
  { provinceCode: '11', provinceName: '北京', cities: ['东城区', '朝阳区', '海淀区'] },
  { provinceCode: '31', provinceName: '上海', cities: ['黄浦区', '徐汇区', '浦东新区'] },
  { provinceCode: '44', provinceName: '广东', cities: ['广州', '深圳', '东莞', '佛山'] },
  { provinceCode: '33', provinceName: '浙江', cities: ['杭州', '宁波', '温州'] },
  { provinceCode: '32', provinceName: '江苏', cities: ['南京', '苏州', '无锡'] },
  { provinceCode: '51', provinceName: '四川', cities: ['成都', '绵阳'] },
  { provinceCode: '42', provinceName: '湖北', cities: ['武汉', '宜昌'] },
  { provinceCode: '43', provinceName: '湖南', cities: ['长沙', '株洲'] },
  { provinceCode: '50', provinceName: '重庆', cities: ['渝中区', '江北区'] },
  { provinceCode: '12', provinceName: '天津', cities: ['和平区', '滨海新区'] },
  { provinceCode: '13', provinceName: '河北', cities: ['石家庄', '保定'] },
  { provinceCode: '14', provinceName: '山西', cities: ['太原'] },
  { provinceCode: '15', provinceName: '内蒙古', cities: ['呼和浩特'] },
  { provinceCode: '21', provinceName: '辽宁', cities: ['沈阳', '大连'] },
  { provinceCode: '22', provinceName: '吉林', cities: ['长春'] },
  { provinceCode: '23', provinceName: '黑龙江', cities: ['哈尔滨'] },
  { provinceCode: '34', provinceName: '安徽', cities: ['合肥'] },
  { provinceCode: '35', provinceName: '福建', cities: ['福州', '厦门'] },
  { provinceCode: '36', provinceName: '江西', cities: ['南昌'] },
  { provinceCode: '37', provinceName: '山东', cities: ['济南', '青岛'] },
  { provinceCode: '41', provinceName: '河南', cities: ['郑州'] },
  { provinceCode: '45', provinceName: '广西', cities: ['南宁'] },
  { provinceCode: '46', provinceName: '海南', cities: ['海口'] },
  { provinceCode: '52', provinceName: '贵州', cities: ['贵阳'] },
  { provinceCode: '53', provinceName: '云南', cities: ['昆明'] },
  { provinceCode: '54', provinceName: '西藏', cities: ['拉萨'] },
  { provinceCode: '61', provinceName: '陕西', cities: ['西安'] },
  { provinceCode: '62', provinceName: '甘肃', cities: ['兰州'] },
  { provinceCode: '63', provinceName: '青海', cities: ['西宁'] },
  { provinceCode: '64', provinceName: '宁夏', cities: ['银川'] },
  { provinceCode: '65', provinceName: '新疆', cities: ['乌鲁木齐'] },
  { provinceCode: '81', provinceName: '香港', cities: ['香港'] },
  { provinceCode: '82', provinceName: '澳门', cities: ['澳门'] },
  { provinceCode: '83', provinceName: '台湾', cities: ['台北'] },
];

type CreatorWithOwner = Prisma.KolCreatorGetPayload<{
  include: { owner: { select: { id: true; nickname: true; name: true } } };
}>;

function mapAuthor(c: CreatorWithOwner) {
  return {
    author_id: c.authorId,
    platform_id: c.platformId,
    platform: c.platform,
    nickname: c.nickname,
    cover: c.cover,
    avatar: c.avatar,
    fans: c.fans,
    gender: c.gender,
    location: c.location,
    mcn: c.mcn,
    note_sign: c.noteSign,
    note_count: c.noteCount,
    category: c.category,
    exposure_median: c.exposureMedian,
    read_median: c.readMedian,
    interaction_median: c.interactionMedian,
    engagement_rate: num(c.engagementRate),
    picturePrice: c.picturePrice ? num(c.picturePrice) : null,
    videoPrice: c.videoPrice ? num(c.videoPrice) : null,
    picture_state: c.pictureState,
    video_state: c.videoState,
    cooperation_form: c.cooperationForm,
    home_page: c.homePage,
    in_library: c.inLibrary,
  };
}

function mapLibrary(c: CreatorWithOwner) {
  return {
    id: c.id,
    author_id: c.authorId,
    nickname: c.nickname,
    platform: c.platform,
    avatar: c.avatar,
    fans_count: c.fans,
    category: c.category,
    persona: c.persona,
    mcn: c.mcn,
    note_sign: c.noteSign,
    location: c.location,
    tags: c.tags,
    recent_brands: c.recentBrands,
    contact: c.contactPhone || c.contactWechat || null,
    contact_phone: c.contactPhone,
    contact_wechat: c.contactWechat,
    contact_mail: c.contactMail,
    contact_status: c.contactStatus,
    remark: c.remark,
    status: c.resourceStatus,
    resource_status: c.resourceStatus,
    pgy_image_price: c.picturePrice ? num(c.picturePrice) : null,
    pgy_video_price: c.videoPrice ? num(c.videoPrice) : null,
    owner_id: c.ownerId,
    owner_nickname: c.owner?.nickname ?? c.owner?.name ?? null,
    created_by: c.createdById,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

@Injectable()
export class KolService {
  constructor(private prisma: PrismaService) {}

  async authorsList(dto: AuthorsListDto) {
    const page = Math.max(1, dto.currentPage ?? 1);
    const pageSize = Math.min(60, dto.pageSize ?? 12);

    const where: Prisma.KolCreatorWhereInput = {};
    if (dto.keyword) {
      where.OR = [
        { nickname: { contains: dto.keyword, mode: 'insensitive' } },
        { mcn: { contains: dto.keyword, mode: 'insensitive' } },
        { category: { contains: dto.keyword, mode: 'insensitive' } },
      ];
    }
    if (dto.fansMin != null || dto.fansMax != null) {
      where.fans = {};
      if (dto.fansMin != null) where.fans.gte = dto.fansMin;
      if (dto.fansMax != null) where.fans.lte = dto.fansMax;
    }
    if (dto.priceMin != null) {
      where.OR = [
        { picturePrice: { gte: dto.priceMin } },
        { videoPrice: { gte: dto.priceMin } },
      ];
    }
    if (dto.province) {
      where.location = { contains: dto.province };
    }

    const sortField = dto.sortBy ?? 'fans';
    const fieldMap: Record<string, Prisma.KolCreatorOrderByWithRelationInput> = {
      fans: { fans: 'desc' },
      daily_exposure_median: { exposureMedian: 'desc' },
      daily_read_median: { readMedian: 'desc' },
      daily_interaction_median: { interactionMedian: 'desc' },
      picture_price: { picturePrice: Prisma.SortOrder[dto.sortOrder === 'asc' ? 'asc' : 'desc'] as Prisma.SortOrder },
      video_price: { videoPrice: Prisma.SortOrder[dto.sortOrder === 'asc' ? 'asc' : 'desc'] as Prisma.SortOrder },
    };
    const orderBy =
      dto.sortBy && dto.sortBy !== 'fans'
        ? fieldMap[dto.sortBy] ?? { fans: 'desc' }
        : { fans: 'desc' as Prisma.SortOrder };

    const [total, rows] = await Promise.all([
      this.prisma.kolCreator.count({ where }),
      this.prisma.kolCreator.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { owner: { select: { id: true, nickname: true, name: true } } },
      }),
    ]);

    return {
      list: rows.map(mapAuthor),
      total,
      page,
      page_size: pageSize,
    };
  }

  async libraryList(query: {
    page?: string;
    page_size?: string;
    keyword?: string;
    owner_id?: string;
    contact_status?: string;
    resource_status?: string;
    mcn?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 50) || 50);

    const where: Prisma.KolCreatorWhereInput = { inLibrary: true };
    if (query.keyword) {
      where.OR = [
        { nickname: { contains: query.keyword, mode: 'insensitive' } },
        { mcn: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.owner_id) where.ownerId = Number(query.owner_id);
    if (query.contact_status) where.contactStatus = query.contact_status;
    if (query.resource_status) where.resourceStatus = Number(query.resource_status);
    if (query.mcn) where.mcn = query.mcn;

    const grouped = await this.prisma.kolCreator.groupBy({
      by: ['contactStatus'],
      where: { inLibrary: true },
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const g of grouped) statusCounts[g.contactStatus] = g._count._all;

    const [total, rows] = await Promise.all([
      this.prisma.kolCreator.count({ where }),
      this.prisma.kolCreator.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { owner: { select: { id: true, nickname: true, name: true } } },
      }),
    ]);

    return { list: rows.map(mapLibrary), total, page, status_counts: statusCounts };
  }

  async collect(dto: CollectDto, userId: number) {
    const updated = await this.prisma.kolCreator.updateMany({
      where: { authorId: { in: dto.authorIds }, inLibrary: false },
      data: { inLibrary: true, contactStatus: 'pending' },
    });
    if (updated.count > 0) {
      await this.prisma.kolLog.create({
        data: {
          actionType: 'collect',
          operatorId: userId,
          targetName: '达人库',
          targetCount: updated.count,
          summary: `收藏 ${updated.count} 位达人入库`,
        },
      });
    }
    return { added: updated.count };
  }

  async uncollect(id: number, userId: number) {
    const creator = await this.prisma.kolCreator.findUnique({ where: { id } });
    if (!creator) throw new NotFoundException('达人不存在');
    await this.prisma.kolCreator.update({
      where: { id },
      data: { inLibrary: false },
    });
    await this.prisma.kolLog.create({
      data: {
        actionType: 'delete',
        operatorId: userId,
        targetName: creator.nickname,
        summary: `将「${creator.nickname}」移出达人库`,
      },
    });
    return { id };
  }

  async updateCreator(id: number, dto: UpdateCreatorDto, userId: number) {
    const creator = await this.prisma.kolCreator.findUnique({ where: { id } });
    if (!creator) throw new NotFoundException('达人不存在');

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const LABELS: Record<string, string> = {
      category: '内容分类',
      persona: '人设定位',
      tags: '标签',
      contactPhone: '联系电话',
      contactWechat: '微信号',
      contactMail: '邮箱',
      contactStatus: '建联状态',
      ownerId: '负责人',
      remark: '备注',
    };
    const pairs: [string, unknown][] = [
      ['category', dto.category],
      ['persona', dto.persona],
      ['tags', dto.tags],
      ['contactPhone', dto.contactPhone],
      ['contactWechat', dto.contactWechat],
      ['contactMail', dto.contactMail],
      ['contactStatus', dto.contactStatus],
      ['ownerId', dto.ownerId],
      ['remark', dto.remark],
    ];
    for (const [field, value] of pairs) {
      if (value === undefined) continue;
      const old = creator[field as keyof typeof creator];
      if (JSON.stringify(old) !== JSON.stringify(value)) {
        changes[field] = {
          old: old === null ? null : JSON.parse(JSON.stringify(old)),
          new: value,
        };
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('没有可提交的变更');
    }

    const summary = Object.keys(changes)
      .map((f) => LABELS[f] ?? f)
      .join('、');

    await this.prisma.kolReview.create({
      data: {
        creatorId: id,
        status: 'pending',
        summary: `修改${summary}`,
        changes: changes as Prisma.InputJsonValue,
        operatorId: userId,
      },
    });
    await this.prisma.kolLog.create({
      data: {
        actionType: 'edit',
        operatorId: userId,
        targetName: creator.nickname,
        summary: `提交「${creator.nickname}」的资料变更（${summary}）`,
      },
    });
    return { submitted: true, fields: Object.keys(changes) };
  }

  async toggleStatus(id: number, userId: number) {
    const creator = await this.prisma.kolCreator.findUnique({ where: { id } });
    if (!creator) throw new NotFoundException('达人不存在');
    const next = creator.resourceStatus === 1 ? 0 : 1;
    await this.prisma.kolCreator.update({
      where: { id },
      data: { resourceStatus: next },
    });
    await this.prisma.kolLog.create({
      data: {
        actionType: 'toggle_status',
        operatorId: userId,
        targetName: creator.nickname,
        summary: `「${creator.nickname}」${next === 0 ? '暂停合作' : '恢复合作'}`,
      },
    });
    return { id, resource_status: next };
  }

  async reviews(query: { status?: string; page?: string; page_size?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 20) || 20);
    const where: Prisma.KolReviewWhereInput = {};
    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.kolReview.count({ where }),
      this.prisma.kolReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: { select: { id: true, nickname: true, avatar: true, mcn: true } },
          operator: { select: { id: true, nickname: true, name: true } },
        },
      }),
    ]);

    return {
      list: rows.map((r) => ({
        id: r.id,
        creator_id: r.creatorId,
        creator_name: r.creator?.nickname,
        creator_avatar: r.creator?.avatar,
        mcn: r.creator?.mcn,
        status: r.status,
        summary: r.summary,
        changes: r.changes,
        operator_id: r.operatorId,
        operator_name: r.operator?.nickname ?? r.operator?.name,
        reviewed_at: r.reviewedAt,
        created_at: r.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async pendingCount() {
    const count = await this.prisma.kolReview.count({ where: { status: 'pending' } });
    return { count };
  }

  async reviewAction(
    id: number,
    action: 'approve' | 'reject',
    dto: ReviewActionDto,
    userId: number,
  ) {
    const review = await this.prisma.kolReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('审核记录不存在');
    if (review.status !== 'pending') {
      throw new BadRequestException('该记录已处理');
    }

    if (action === 'approve') {
      const changes = (review.changes ?? {}) as Record<string, { new: unknown }>;
      const data: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(changes)) {
        data[field] = value.new;
      }
      if (Object.keys(data).length > 0) {
        await this.prisma.kolCreator.update({
          where: { id: review.creatorId },
          data: data as Prisma.KolCreatorUpdateInput,
        });
      }
    }

    await this.prisma.kolReview.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewedAt: new Date(),
        reviewedById: userId,
      },
    });

    const creator = await this.prisma.kolCreator.findUnique({
      where: { id: review.creatorId },
      select: { nickname: true },
    });
    await this.prisma.kolLog.create({
      data: {
        actionType: 'review',
        operatorId: userId,
        targetName: creator?.nickname ?? `审核#${id}`,
        summary: `${action === 'approve' ? '通过' : '驳回'}「${creator?.nickname}」的变更：${dto.reason || '无备注'}`,
      },
    });
    return { id, status: action === 'approve' ? 'approved' : 'rejected' };
  }

  async logs(query: { page?: string; page_size?: string; action_type?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 20) || 20);
    const where: Prisma.KolLogWhereInput = {};
    if (query.action_type) where.actionType = query.action_type;

    const [total, rows] = await Promise.all([
      this.prisma.kolLog.count({ where }),
      this.prisma.kolLog.findMany({
        where,
        orderBy: { operatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { operator: { select: { id: true, nickname: true, name: true } } },
      }),
    ]);

    return {
      list: rows.map((l) => ({
        id: l.id,
        action_type: l.actionType,
        operator_id: l.operatorId,
        operator_name: l.operator?.nickname ?? l.operator?.name,
        target_name: l.targetName,
        target_count: l.targetCount,
        summary: l.summary,
        operated_at: l.operatedAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async institutions(query: {
    institution_keyword?: string;
    include_unassigned?: string;
    sort_field?: string;
    sort_order?: string;
    page?: string;
    page_size?: string;
  }) {
    const all = await this.prisma.kolCreator.findMany({
      where: { inLibrary: true },
      include: { owner: { select: { id: true, nickname: true, name: true } } },
    });

    const groups = new Map<
      string,
      {
        key: string;
        name: string;
        is_unassigned: boolean;
        creator_count: number;
        normal_count: number;
        owners: string[];
        latest_updated_at: Date;
      }
    >();
    for (const c of all) {
      const key = c.mcn ?? '__unassigned__';
      const g = groups.get(key) ?? {
        key,
        name: c.mcn ?? '未分配机构',
        is_unassigned: c.mcn == null,
        creator_count: 0,
        normal_count: 0,
        owners: [],
        latest_updated_at: c.updatedAt,
      };
      g.creator_count++;
      if (c.resourceStatus === 1) g.normal_count++;
      const ownerName = c.owner?.nickname ?? c.owner?.name;
      if (ownerName && !g.owners.includes(ownerName)) g.owners.push(ownerName);
      if (c.updatedAt > g.latest_updated_at) g.latest_updated_at = c.updatedAt;
      groups.set(key, g);
    }

    let list = Array.from(groups.values());
    if (!query.include_unassigned || query.include_unassigned !== 'true') {
      list = list.filter((g) => !g.is_unassigned);
    }
    if (query.institution_keyword) {
      list = list.filter((g) => g.name.includes(query.institution_keyword!));
    }
    const sortField = query.sort_field ?? 'creator_count';
    list.sort((a, b) => {
      const dir = query.sort_order === 'asc' ? 1 : -1;
      if (sortField === 'latest_updated_at') {
        return (a.latest_updated_at.getTime() - b.latest_updated_at.getTime()) * dir;
      }
      return ((a[sortField as 'creator_count'] as number) - (b[sortField as 'creator_count'] as number)) * dir;
    });

    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 20) || 20);
    const total = list.length;

    return {
      list: list
        .slice((page - 1) * pageSize, page * pageSize)
        .map((g) => ({
          key: g.key,
          name: g.name,
          is_unassigned: g.is_unassigned,
          creator_count: g.creator_count,
          normal_count: g.normal_count,
          owners: g.owners,
          latest_updated_at: g.latest_updated_at,
        })),
      total,
      page,
      page_size: pageSize,
      summary: {
        institution_count: groups.size,
        creator_count: all.length,
        normal_creator_count: all.filter((c) => c.resourceStatus === 1).length,
        unassigned_count: all.filter((c) => c.mcn == null).length,
      },
    };
  }

  async institutionCreators(query: { institution_name: string; page?: string; page_size?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 20) || 20);
    const where: Prisma.KolCreatorWhereInput = { inLibrary: true };
    if (query.institution_name === '未分配机构') {
      where.mcn = null;
    } else {
      where.mcn = query.institution_name;
    }

    const [total, rows] = await Promise.all([
      this.prisma.kolCreator.count({ where }),
      this.prisma.kolCreator.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { owner: { select: { id: true, nickname: true, name: true } } },
      }),
    ]);

    return {
      list: rows.map((c) => ({
        id: c.id,
        author_id: c.authorId,
        nickname: c.nickname,
        avatar: c.avatar,
        category: c.category,
        gender: c.gender,
        location: c.location,
        fans_count: c.fans,
        daily_exposure_median: c.exposureMedian,
        daily_read_median: c.readMedian,
        daily_interaction_median: c.interactionMedian,
        pgy_image_price: c.picturePrice ? num(c.picturePrice) : null,
        pgy_video_price: c.videoPrice ? num(c.videoPrice) : null,
        resource_status: c.resourceStatus,
        owner_id: c.ownerId,
        owner_nickname: c.owner?.nickname ?? c.owner?.name ?? null,
        updated_at_text: c.updatedAt.toISOString().slice(0, 10),
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async userList(userId: number) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    const users = await this.prisma.user.findMany({
      where: { companyId: me?.companyId ?? 1 },
      select: { id: true, nickname: true, name: true, phone: true },
      orderBy: { id: 'asc' },
    });
    return {
      list: users.map((u) => ({
        id: u.id,
        nickname: u.nickname ?? u.name ?? u.phone,
      })),
    };
  }

  async mcns() {
    const rows = await this.prisma.kolCreator.findMany({
      where: { mcn: { not: null } },
      select: { mcn: true },
      distinct: ['mcn'],
    });
    return rows.map((r) => r.mcn);
  }

  async tags() {
    const rows = await this.prisma.kolCreator.findMany({
      where: { inLibrary: true },
      select: { tags: true },
    });
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags) set.add(t);
    return Array.from(set);
  }

  regionTree() {
    return REGION_TREE.map((p) => ({
      provinceCode: p.provinceCode,
      provinceName: p.provinceName,
      cities: p.cities,
    }));
  }

  async importTemplate() {
    const header = '小红书号,昵称,粉丝数,内容分类,机构MCN,所在地,图文报价,视频报价,联系电话,微信,邮箱,备注';
    return header;
  }
}
