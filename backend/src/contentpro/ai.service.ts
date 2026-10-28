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

  /** OpenAI 兼容网关：智谱/DeepSeek/通义/Kimi 等仅靠环境变量切换 */
  private llmBase() {
    return (process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  }

  private llmModel() {
    return process.env.LLM_MODEL ?? 'glm-4-flash';
  }

  async health() {
    return { llm: this.enabled(), model: this.llmModel(), base_url: this.llmBase() };
  }

  async generateArticle(input: {
    brandId: number;
    productId: number;
    strategyId?: number | null;
    extra?: string;
    directionName?: string | null;
    wordCount?: string | null;
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
    const directionName = input.directionName ?? directions?.[0]?.name ?? '';

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
          directionDescription: input.directionName
            ? directions?.find((d) => d.name === input.directionName)?.description
            : undefined,
          wordCount: input.wordCount ?? undefined,
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
    directionDescription?: string;
    wordCount?: string;
    extra?: string;
  }): Promise<GenerateResult> {
    const wc = ctx.wordCount ?? '300-600';
    const sys = [
      '你是小红书 KOS 笔记写手，用门店销售第一人称口语化写作。',
      '输出严格 JSON：{"titles":["标题1","标题2","标题3"],"content":"正文","tags":["标签1",...]}',
      `要求：标题 ≤20 字；正文 ${wc} 字，分段自然，可用 emoji 列卖点，结尾引导私信/到店；`,
      '标签 4-6 个，# 后接关键词。',
    ].join('\n');
    const user = [
      `产品：${ctx.productName}`,
      ctx.strategyName ? `创作策略（人设）：${ctx.strategyName}` : '',
      ctx.persona.length ? `人设：${ctx.persona.join('；')}` : '',
      ctx.sellingPoints.length ? `必须覆盖的卖点：\n- ${ctx.sellingPoints.join('\n- ')}` : '',
      ctx.audience.length ? `目标受众：${ctx.audience.join('、')}` : '',
      ctx.directionName ? `内容方向：${ctx.directionName}${ctx.directionDescription ? `（${ctx.directionDescription}）` : ''}` : '',
      ctx.knowledge ? `产品知识（节选）：\n${ctx.knowledge}` : '',
      ctx.extra ? `额外写作要求：${ctx.extra}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(`${this.llmBase()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.llmModel(),
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
    // 兜底模板以策略卖点为骨架；各品牌卖点差异大，不做通用假卖点（历史遗留的东风预设已移除）
    if (!ctx.sellingPoints.length) {
      throw new Error('所选策略未配置卖点，无法生成兜底文案，请先在创作策略中补充卖点');
    }
    const points = ctx.sellingPoints;

    const titles = [
      `${p}到底怎么选？帮你把重点捋清楚`,
      `第一次了解${p}？这篇讲清大家最关心的几件事`,
      `${p}值不值得入手？${points.length} 个卖点给你交底`,
    ];

    const bullet = points.map((s) => `🎁 ${s}`).join('\n\n');
    const kn = ctx.knowledge
      ? ctx.knowledge.replace(/\s+/g, ' ').slice(0, 140)
      : '';
    const content = [
      `昨天下午有个客户坐在店里，翻着手机问我：${p}，到底图啥。`,
      '',
      `我跟你讲，${role.split('，')[0]}最不怕的就是摆事实。今天把重点给你摊开：`,
      '',
      bullet,
      '',
      kn ? `再说产品本身：${kn}……（篇幅有限，到店我给你逐条讲）` : `再说产品本身，到店我给你逐条讲。`,
      '',
      `每个人情况不一样，别急着下决定。拿不准的把自己的用车场景和预算滴我，我按你的情况帮你捋一遍。`,
      ctx.extra ? `\n备注：${ctx.extra}` : '',
    ]
      .filter((s) => s !== undefined)
      .join('\n');

    const tags = Array.from(
      new Set(
        [
          p,
          `${p}种草`,
          ...ctx.sellingPoints
            .map((s) => s.split(/[，,：:—]/)[0])
            .map((s) => s.slice(0, 8)),
          ctx.directionName,
          '购车攻略',
          '到店实拍',
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
