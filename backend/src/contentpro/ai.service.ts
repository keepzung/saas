// AI 文章生成服务：GLM API 优先（LLM_API_KEY），未配置 key 时回退模板拼装（source=template）
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GenerateResult {
  titles: string[];
  content: string;
  tags: string[];
  source: 'llm' | 'template';
}

const asArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private prisma: PrismaService) {}

  private enabled() {
    return Boolean(process.env.LLM_API_KEY);
  }

  async health() {
    return { llm: this.enabled(), model: process.env.LLM_MODEL ?? 'glm-4-flash' };
  }

  async generateArticle(input: {
    brandId: number;
    productId: number;
    strategyId?: number | null;
    extra?: string;
  }): Promise<GenerateResult> {
    let product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) {
      const fb = await this.prisma.product.findFirst({
        where: { brandId: input.brandId, configType: 'product' },
        orderBy: { id: 'asc' },
      });
      if (!fb) throw new Error('该工作区尚无产品，请先在资料库配置产品树');
      product = fb;
    }
    const strategy = input.strategyId
      ? await this.prisma.writingStrategy.findUnique({ where: { id: input.strategyId } })
      : null;
    const productName = product?.displayName ?? product?.name ?? '产品';
    const knowledge = [product?.knowledge, product?.salesPolicy, product?.faq]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1200);
    const persona = asArr(strategy?.persona as unknown);
    const sellingPoints = asArr(strategy?.sellingPoints as unknown);
    const audience = asArr(strategy?.audience as unknown);
    const directions = (strategy?.contentDirections as unknown) as
      | { name: string; description?: string }[]
      | null;
    const directionName = directions?.[0]?.name ?? '';

    if (this.enabled()) {
      try {
        return await this.callLlm({
          productName,
          knowledge,
          strategyName: strategy?.name,
          persona,
          sellingPoints,
          audience,
          directionName,
          extra: input.extra,
        });
      } catch (e) {
        this.logger.warn(`LLM 生成失败回退模板: ${e?.message ?? e}`);
      }
    }
    return this.templateCompose({
      productName,
      strategyName: strategy?.name,
      persona,
      sellingPoints,
      audience,
      directionName,
      knowledge,
      extra: input.extra,
    });
  }

  // ── GLM 调用 ────────────────────────────────────────────────────────
  private async callLlm(ctx: {
    productName: string;
    knowledge: string;
    strategyName?: string;
    persona: string[];
    sellingPoints: string[];
    audience: string[];
    directionName: string;
    extra?: string;
  }): Promise<GenerateResult> {
    const sys = [
      '你是小红书 KOS 笔记写手，用门店销售第一人称口语化写作。',
      '输出严格 JSON：{"titles":["标题1","标题2","标题3"],"content":"正文","tags":["标签1",...]}',
      '要求：标题 ≤20 字；正文 300-600 字，分段自然，可用 emoji 列卖点，结尾引导私信/到店；',
      '标签 4-6 个，# 后接关键词。',
    ].join('\n');
    const user = [
      `产品：${ctx.productName}`,
      ctx.strategyName ? `创作策略（人设）：${ctx.strategyName}` : '',
      ctx.persona.length ? `人设：${ctx.persona.join('；')}` : '',
      ctx.sellingPoints.length ? `必须覆盖的卖点：\n- ${ctx.sellingPoints.join('\n- ')}` : '',
      ctx.audience.length ? `目标受众：${ctx.audience.join('、')}` : '',
      ctx.directionName ? `内容方向：${ctx.directionName}` : '',
      ctx.knowledge ? `产品知识（节选）：\n${ctx.knowledge}` : '',
      ctx.extra ? `额外写作要求：${ctx.extra}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'glm-4-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
      }),
    });
    if (!res.ok) throw new Error(`LLM http ${res.status}`);
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = j.choices?.[0]?.message?.content ?? '';
    const parsed = this.parseLlmJson(text);
    if (!parsed) throw new Error('LLM 输出解析失败');
    return { ...parsed, source: 'llm' };
  }

  private parseLlmJson(text: string): Omit<GenerateResult, 'source'> | null {
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const o = JSON.parse(m[0]) as {
        titles?: unknown;
        content?: unknown;
        tags?: unknown;
      };
      const titles = asArr(o.titles);
      const content = String(o.content ?? '');
      const tags = asArr(o.tags).map((t) => t.replace(/^#/, ''));
      if (!titles.length || !content) return null;
      return { titles, content, tags };
    } catch {
      return null;
    }
  }

  // ── 模板回退 ────────────────────────────────────────────────────────
  private templateCompose(ctx: {
    productName: string;
    strategyName?: string;
    persona: string[];
    sellingPoints: string[];
    audience: string[];
    directionName: string;
    knowledge: string;
    extra?: string;
  }): GenerateResult {
    const p = ctx.productName;
    const role = ctx.persona[0] ?? ctx.strategyName ?? '门店销售';
    const points = ctx.sellingPoints.length
      ? ctx.sellingPoints
      : ['限时预售权益，现在下订福利感拉满', '三电终身质保，长期持有放心', '锁单优先排产，早定早提车'];

    const titles = [
      `${p}现在订还是等上市？我算给你听`,
      `第一次看${p}？这篇讲清权益怎么用最划算`,
      `${p}值不值得下手？${points.length} 个卖点给你交底`,
    ];

    const bullet = points.map((s) => `🎁 ${s}`).join('\n\n');
    const kn = ctx.knowledge
      ? ctx.knowledge.replace(/\s+/g, ' ').slice(0, 140)
      : '';
    const content = [
      `昨天下午有个客户坐在店里，翻着手机问我：现在下手${p}，到底图啥。`,
      '',
      `我跟你讲，${role.split('，')[0]}最不怕的就是算账。今天把这本账给你摊开：`,
      '',
      bullet,
      '',
      kn ? `再说车本身：${kn}……（篇幅有限，到店我给你逐条讲）` : `再说车本身，到店我给你逐条讲。`,
      '',
      `纠结的其实就一件事：你是想早点提车，还是想等上市后再看价格。这两个需求对应的动作不一样，别混着来。拿不准的把平时通勤和家里几口人用车的情况滴我，我按你的情况把落地账算一遍。`,
      ctx.extra ? `\n备注：${ctx.extra}` : '',
    ]
      .filter((s) => s !== undefined)
      .join('\n');

    const tags = Array.from(
      new Set(
        [
          p,
          `${p}预售`,
          ...ctx.sellingPoints
            .map((s) => s.split(/[，,：:—]/)[0])
            .map((s) => s.slice(0, 8)),
          ctx.directionName,
          '购车攻略',
          '限时权益',
        ].filter(Boolean),
      ),
    ).slice(0, 6);

    return { titles, content, tags, source: 'template' };
  }

  // ── 智能配图：按产品节点 → 品牌（东风/格力素材池小，先品牌内随机）────
  async randomImages(brandId: number, productId?: number, num = 6) {
    const take = Math.min(12, Math.max(1, num));
    const productNodeIds: number[] = [];
    if (productId) {
      productNodeIds.push(productId);
      const product = await this.prisma.product.findUnique({ where: { id: productId } });
      if (product?.parentId) productNodeIds.push(product.parentId);
    }
    const where = {
      brandId,
      status: 1,
      ...(productNodeIds.length
        ? { OR: [{ productNodeId: { in: productNodeIds } }, { productNodeId: null }] }
        : {}),
    };
    const pool = await this.prisma.materialImage.findMany({ where, take: 200 });
    // 打乱后取前 N（优先已分类的图）
    const sorted = pool.sort((a, b) => {
      const ap = (a.setId ?? 0) * 2 + (a.typeId ?? 0);
      const bp = (b.setId ?? 0) * 2 + (b.typeId ?? 0);
      return bp - ap;
    });
    const classified = sorted.slice(0, Math.ceil(take * 1.5));
    const rest = pool.filter((x) => !classified.includes(x));
    const picked = [...classified.sort(() => Math.random() - 0.5), ...rest.sort(() => Math.random() - 0.5)].slice(0, take);
    return picked.map((x) => ({ id: x.id, url: x.url, name: x.name, setId: x.setId, typeId: x.typeId }));
  }
}
