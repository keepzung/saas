// 产品↔达人匹配：品类/粉丝/互动召回 → LLM 批量评分（0-100 + 推荐理由）→ KolMatch 落库
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chatJson, llmEnabled } from './llm.util';

const RECALL_LIMIT = Number(process.env.MATCH_RECALL_LIMIT ?? 300);
const BATCH_SIZE = 20;

interface ScoredCreator {
  id: number;
  score: number;
  rationale: string;
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(private prisma: PrismaService) {}

  /** 对产品跑一轮匹配：召回 → LLM 评分 → 替换候选 */
  async run(input: { brandId: number; productId: number; userId: number; topK?: number }) {
    if (!llmEnabled()) throw new BadRequestException('LLM_API_KEY 未配置，无法评分');
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, brandId: input.brandId },
    });
    if (!product) throw new NotFoundException('产品不存在');
    const topK = Math.min(50, Math.max(5, input.topK ?? 20));

    // 召回：活跃达人池（热点入池/收藏/手工导入），按 hotHits+粉丝排序
    const candidates = await this.prisma.kolCreator.findMany({
      where: {
        resourceStatus: 1,
        fans: { gte: 500, lte: 5000000 },
      },
      orderBy: [{ hotHits: 'desc' }, { fans: 'desc' }],
      take: RECALL_LIMIT,
      select: {
        id: true,
        nickname: true,
        platform: true,
        fans: true,
        category: true,
        persona: true,
        tags: true,
        goodsCategories: true,
        recentBrands: true,
        exposureMedian: true,
        readMedian: true,
        interactionMedian: true,
        engagementRate: true,
        noteCount: true,
        picturePrice: true,
        videoPrice: true,
        hotHits: true,
      },
    });
    if (!candidates.length) throw new BadRequestException('达人池为空，请先在达人广场收藏或通过热点抓取积累达人');

    // LLM 分批评分（glm-4-flash 对长列表会偷懒漏人：批内强制条数 + 空结果重试一次 + 序号兜底）
    const productBrief = [
      `产品：${product.displayName ?? product.name}`,
      product.knowledge ? `产品介绍：${product.knowledge.slice(0, 500)}` : '',
      product.description ? `补充说明：${product.description.slice(0, 300)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const scored: ScoredCreator[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const list = batch.map((c) => {
        const prices = [
          c.picturePrice ? `图文${Number(c.picturePrice)}元` : '',
          c.videoPrice ? `视频${Number(c.videoPrice)}元` : '',
        ]
          .filter(Boolean)
          .join('/');
        return [
          `id=${c.id} [${c.platform}] ${c.nickname}（粉丝${c.fans}${c.hotHits ? `，热点命中${c.hotHits}次` : ''}）`,
          c.category ? `类目：${c.category}` : '',
          c.goodsCategories.length ? `带货类目：${c.goodsCategories.join('、')}` : '',
          c.persona ? `人设：${c.persona}` : '',
          c.tags.length ? `标签：${c.tags.join('、')}` : '',
          c.recentBrands.length ? `近期合作品牌：${c.recentBrands.join('、')}` : '',
          c.engagementRate ? `互动率：${Number(c.engagementRate)}%` : '',
          prices ? `报价：${prices}` : '',
        ]
          .filter(Boolean)
          .join('；');
      });
      const sys = [
        '你是达人匹配评分官。给定产品和一批达人资料，为每位达人输出与产品带货契合度的评分与理由。',
        '评分 0-100：90+ 强推（类目/人群高度契合且有带货痕迹），70-89 推荐（人群/风格契合），40-69 可考虑（泛匹配），<40 不推荐。',
        '理由 ≤40 字，指出契合点或风险。',
        `达人列表共 ${batch.length} 位，scores 数组必须恰好包含 ${batch.length} 条，每位达人一条，id 用行首的 id=N 原样输出，不能省略、不能合并。`,
        '输出严格 JSON：{"scores":[{"id":N,"score":85,"rationale":"..."}]}',
      ].join('\n');
      const user = `${productBrief}\n\n达人列表：\n${list.join('\n')}`;
      const collect = (arr: { id?: unknown; score?: unknown; rationale?: unknown }[] | undefined) => {
        const byId = new Map(batch.map((c) => [c.id, c]));
        for (const s of arr ?? []) {
          let c = byId.get(Number(s.id));
          if (!c && Number(s.id) >= 1 && Number(s.id) <= batch.length) c = batch[Number(s.id) - 1]; // 模型把 id 当序号时兜底
          if (!c || seen.has(c.id)) continue;
          seen.add(c.id);
          scored.push({
            id: c.id,
            score: Math.max(0, Math.min(100, Math.round(Number(s.score) || 0))),
            rationale: String(s.rationale ?? '').slice(0, 200),
          });
        }
      };
      try {
        const parsed = await chatJson<{ scores: { id?: unknown; score?: unknown; rationale?: unknown }[] }>(sys, user, { temperature: 0.3 });
        collect(parsed?.scores);
        // 覆盖不足一半时重试一次
        if (scored.length < i + batch.length / 2 && scored.filter((s) => batch.some((b) => b.id === s.id)).length < batch.length / 2) {
          const retry = await chatJson<{ scores: { id?: unknown; score?: unknown; rationale?: unknown }[] }>(
            `${sys}\n注意：上一次输出遗漏了多位达人，这次必须逐条输出全部 ${batch.length} 条。`,
            user,
            { temperature: 0.2 },
          );
          collect(retry?.scores);
        }
      } catch (e) {
        this.logger.warn(`匹配评分批次失败（跳过该批）: ${(e as Error).message?.split('\n')[0]}`);
      }
    }
    if (!scored.length) throw new BadRequestException('评分失败：LLM 未返回有效结果，请稍后重试');

    const top = scored.sort((a, b) => b.score - a.score).slice(0, topK);
    await this.prisma.$transaction([
      // 旧的候选清掉（已建联/已合作/否决的保留）
      this.prisma.kolMatch.deleteMany({ where: { productId: input.productId, status: 'candidate' } }),
      ...top.map((s) =>
        this.prisma.kolMatch.create({
          data: { brandId: input.brandId, productId: input.productId, creatorId: s.id, score: s.score, rationale: s.rationale, status: 'candidate' },
        }),
      ),
    ]);
    return { matched: top.length, total_candidates: candidates.length };
  }

  async list(brandId: number, q: { productId?: number; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 30));
    const where = {
      brandId,
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.kolMatch.findMany({
        where,
        orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: {
            select: {
              id: true,
              platform: true,
              authorId: true,
              nickname: true,
              avatar: true,
              fans: true,
              category: true,
              persona: true,
              tags: true,
              engagementRate: true,
              picturePrice: true,
              videoPrice: true,
              homePage: true,
              contactStatus: true,
              hotHits: true,
            },
          },
        },
      }),
      this.prisma.kolMatch.count({ where }),
    ]);
    // product 是普通列非关系，单独取名称
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, displayName: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    return {
      total,
      page,
      page_size: pageSize,
      items: rows.map((r) => {
        const p = productMap.get(r.productId);
        return {
        id: r.id,
        score: r.score,
        rationale: r.rationale,
        status: r.status,
        product: p ? { id: p.id, name: p.displayName ?? p.name } : null,
        creator: {
          id: r.creator.id,
          platform: r.creator.platform,
          author_id: r.creator.authorId,
          nickname: r.creator.nickname,
          avatar: r.creator.avatar,
          fans: r.creator.fans,
          category: r.creator.category,
          persona: r.creator.persona,
          tags: r.creator.tags,
          engagement_rate: Number(r.creator.engagementRate ?? 0),
          picture_price: r.creator.picturePrice ? Number(r.creator.picturePrice) : null,
          video_price: r.creator.videoPrice ? Number(r.creator.videoPrice) : null,
          home_page: r.creator.homePage,
          contact_status: r.creator.contactStatus,
          hot_hits: r.creator.hotHits,
        },
        };
      }),
    };
  }

  async updateStatus(brandId: number, id: number, status: string) {
    const allowed = ['candidate', 'contacted', 'cooperating', 'rejected'];
    if (!allowed.includes(status)) throw new BadRequestException('非法状态');
    const row = await this.prisma.kolMatch.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('匹配记录不存在');
    const updated = await this.prisma.kolMatch.update({ where: { id }, data: { status } });
    // 联动达人建联状态
    const map: Record<string, string> = { candidate: 'pending', contacted: 'contacting', cooperating: 'contacted', rejected: 'failed' };
    await this.prisma.kolCreator.update({ where: { id: row.creatorId }, data: { contactStatus: map[status] } }).catch(() => {});
    return { id: updated.id, status: updated.status };
  }
}
