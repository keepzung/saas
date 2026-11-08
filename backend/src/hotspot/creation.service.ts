// 爆款复刻文案：拆解结构 + 产品知识 → glm-4-flash 生成 → 落 XhsHistory（接入内容工厂审核/内容包/领用闭环）
// 计费与单篇生成一致：1 算力/篇，失败退回
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../contentpro/quota.service';
import { chatJson, llmEnabled } from './llm.util';

interface ArticleResult {
  titles: string[];
  content: string;
  tags: string[];
}

@Injectable()
export class CreationService {
  constructor(
    private prisma: PrismaService,
    private quota: QuotaService,
  ) {}

  async generateFromBreakdown(input: {
    brandId: number;
    userId: number;
    breakdownId: number;
    productId: number;
    strategyId?: number | null;
    extra?: string;
    wordCount?: string | null;
  }) {
    if (!llmEnabled()) throw new BadRequestException('LLM_API_KEY 未配置，无法生成');
    const breakdown = await this.prisma.contentBreakdown.findUnique({
      where: { id: input.breakdownId },
      include: { hotContent: { select: { platform: true, title: true, kind: true } } },
    });
    if (!breakdown || breakdown.status !== 'done') throw new NotFoundException('拆解不存在或未完成');

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, brandId: input.brandId },
    });
    if (!product) throw new NotFoundException('产品不存在');
    const strategy = input.strategyId
      ? await this.prisma.writingStrategy.findUnique({ where: { id: input.strategyId } })
      : await this.prisma.writingStrategy.findFirst({ where: { brandId: input.brandId, enabled: true } });

    await this.quota.assertEnough(input.brandId, 1);
    await this.quota.consume(input.brandId, 1, input.userId, '爆款复刻生成');

    try {
      const asArr = (v: unknown): string[] =>
        Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];
      const wc = input.wordCount ?? '300-600';
      const sys = [
        '你是小红书 KOS 笔记写手，用门店销售第一人称口语化写作。',
        '参考给你的一份「爆款拆解」，学习其钩子写法、段落节奏、卖点表达和行动号召方式，但必须结合指定产品重新原创，不要照抄原文案。',
        '输出严格 JSON：{"titles":["标题1","标题2","标题3"],"content":"正文","tags":["标签1",...]}',
        `要求：标题 ≤20 字，带钩子感；正文 ${wc} 字，分段自然，可用 emoji 列卖点，结尾引导私信/到店；标签 4-6 个，# 后接关键词。`,
      ].join('\n');
      const user = [
        `产品：${product.displayName ?? product.name}`,
        product.knowledge || product.salesPolicy || product.faq
          ? `产品知识（节选）：${[product.knowledge, product.salesPolicy, product.faq].filter(Boolean).join('\n').slice(0, 1000)}`
          : '',
        strategy?.persona ? `人设：${asArr(strategy.persona).join('；')}` : '',
        strategy?.sellingPoints ? `必须覆盖的卖点：${asArr(strategy.sellingPoints).join('；')}` : '',
        strategy?.audience ? `目标受众：${asArr(strategy.audience).join('、')}` : '',
        `爆款拆解参考（来自 ${breakdown.hotContent.platform} 的「${breakdown.hotContent.title}」）：`,
        `钩子：${breakdown.hook ?? ''}`,
        `结构节奏：${JSON.stringify(breakdown.structure).slice(0, 600)}`,
        breakdown.sellingPoints ? `其卖点表达：${asArr(breakdown.sellingPoints).join('；')}` : '',
        `CTA：${breakdown.cta ?? ''}`,
        breakdown.scriptText ? `原文案（仅供学习节奏，禁止照抄）：\n${breakdown.scriptText.slice(0, 600)}` : '',
        breakdown.replicateTips ? `拆解复刻建议：${breakdown.replicateTips}` : '',
        input.extra ? `额外写作要求：${input.extra}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const parsed = await chatJson<ArticleResult>(sys, user, { temperature: 0.8 });
      if (!parsed?.content || !parsed?.titles?.length) throw new Error('LLM 输出解析失败');

      const history = await this.prisma.xhsHistory.create({
        data: {
          brandId: input.brandId,
          title: parsed.titles[0],
          content: parsed.content,
          tags: (parsed.tags ?? []).map((t) => String(t).replace(/^#/, '')).slice(0, 8),
          source: 'hotspot_breakdown',
          strategyId: input.strategyId ?? strategy?.id ?? null,
          directionName: '爆款复刻',
          reviewStatus: 'draft',
          createdById: input.userId,
        },
      });
      return {
        history_id: history.id,
        titles: parsed.titles,
        content: parsed.content,
        tags: parsed.tags ?? [],
      };
    } catch (e) {
      await this.quota.refund(input.brandId, 1, input.userId, '爆款复刻生成失败退回');
      throw e;
    }
  }
}
