// AI 文章生成服务：GLM API 优先（LLM_API_KEY），未配置 key 时回退模板拼装（source=template）
// 2026-11-17 建设项：品牌模板注入 + 四类笔记×双风格×图文/短视频 prompt 矩阵 + AI 预审评分（有效率≥70%三道闸门之二）
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GenerateResult {
  titles: string[];
  content: string;
  tags: string[];
  source: 'llm' | 'template';
  /** 短视频口播脚本（form=video_script 时返回），落 XhsHistory.scriptJson */
  script?: VideoScript | null;
}

export interface VideoScript {
  hook: string;
  shots: { visual: string; voiceover: string }[];
  cta: string;
}

export interface PreReviewResult {
  score: number; // 0-100 总分
  verdict: 'pass' | 'rewrite' | 'reject';
  dims: {
    brandFit: number; // 品牌调性符合度
    sellingAccuracy: number; // 卖点准确性
    compliance: number; // 合规性
    originality: number; // 原创度
    platformFit: number; // 平台适配度
  };
  issues: string[];
  suggestion?: string;
  ruleHits: { ruleId: number; name: string; action: string; matched: string; replyHint?: string }[];
}

export interface StrategyDraftResult {
  name: string;
  description: string;
  prompt: string;
  mode: 'precise' | 'open';
  format_text: string;
  required_tags: string[];
  forbidden: string;
  tone: string[];
  visual: { mode: string; count: number; set_id: number | null; slots: { tagId?: number; position?: string }[] };
  bound_product_ids: number[];
  persona: string[];
  selling_points: string[];
  audience: string[];
  content_directions: { name: string; description: string }[];
}

export const NOTE_KINDS: Record<string, { label: string; guidance: string }> = {
  seeding: { label: '种草笔记', guidance: '围绕车型卖点种草，激发购买兴趣；讲清「为什么值得买」，用体验感与对比强化种草效果。' },
  scene: { label: '场景笔记', guidance: '从真实用车场景切入（家庭出行/日常通勤/节假日自驾/周末近郊），让读者代入「这就是我的生活」，自然带出车型价值。' },
  life: { label: '生活笔记', guidance: '门店真实日常（交车仪式/店长日常/员工故事/车主活动），塑造真人销售人设，弱化推销感，重在真实与温度。' },
  policy: { label: '政策钩子笔记', guidance: '以购车政策/金融方案/限时权益/节点促销为钩子，制造紧迫感促进行动，但必须合规表述，不夸大不虚假承诺。' },
};

const STYLE_GUIDANCE: Record<string, string> = {
  brand: '品牌模版风格：结构完整、卖点准确、表述规范专业，可适度活泼但信息密度优先。',
  kos: 'KOS 真人风格：门店销售第一人称口语化叙事，融入门店真实细节与个人表达习惯，像朋友圈/真实分享，不要官方腔。',
};

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

  /** 通用 chatJson：LLM 输出严格 JSON 并解析（预审/评分等共用） */
  async chatJson<T>(system: string, user: string, temperature = 0.3): Promise<T> {
    const res = await fetch(`${this.llmBase()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.llmModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
      }),
    });
    if (!res.ok) throw new Error(`LLM http ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('LLM 输出解析失败');
    return JSON.parse(m[0]) as T;
  }

  /** 品牌模板注入材料：话术规范(全局) + 车型模板(按产品优先回退全局) + 合规模板 */
  private async loadTemplates(brandId: number, productId?: number) {
    const rows = await this.prisma.brandTemplate.findMany({
      where: { brandId, status: 1, kind: { in: ['script_spec', 'vehicle_template', 'compliance_template'] } },
      orderBy: { id: 'asc' },
    });
    const spec = rows.find((r) => r.kind === 'script_spec') ?? null;
    const vehicle =
      rows.find((r) => r.kind === 'vehicle_template' && r.productId === productId) ??
      rows.find((r) => r.kind === 'vehicle_template' && r.productId == null) ??
      null;
    const complianceTpl = rows.find((r) => r.kind === 'compliance_template') ?? null;
    return { spec, vehicle, complianceTpl };
  }

  /** KOS 填空 → AI 生成写作策略草稿（轻量 chatJson，不扣算力；仅草稿，KOS 可继续调整） */
  async generateStrategyDraft(input: {
    brandId: number;
    productId?: number | null;
    angle?: string;
    viewpoint?: string;
    keyPoints?: string;
  }): Promise<StrategyDraftResult> {
    const hasAngle = Boolean(input.angle?.trim());
    const hasView = Boolean(input.viewpoint?.trim());
    const hasKeys = Boolean(input.keyPoints?.trim());
    if (!input.productId && !hasAngle && !hasView && !hasKeys) {
      throw new BadRequestException('请选择产品，或至少填写一个空（角度/观点/要点）');
    }
    let product: { name: string; displayName: string | null; description: string | null; knowledge: string | null; salesPolicy: string | null; faq: string | null } | null = null;
    if (input.productId) {
      const found = await this.prisma.product.findUnique({ where: { id: input.productId } });
      if (found) product = found;
    }
    const knowledge = [product?.knowledge, product?.salesPolicy, product?.faq]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1200);
    const system = [
      '你是小红书 KOS（品牌门店员工）的内容策略专家。',
      'KOS 给你：产品信息、写作角度、想表达的观点、必须覆盖的重要要点。',
      '请产出一份可直接使用的写作策略，输出严格 JSON：',
      '{"name":"人设化策略名(12字内)","description":"一句话概括面向什么客户讲什么重点","mode":"precise或open","prompt":"带【产品卖点】【人设】【目标受众】等占位符的写作要求提示词模板(分段:开头钩子/正文要点/结尾引导,300-500字)","formatText":"格式框定:字数/结构/标题要求","requiredTags":["#必带话题1","#品牌标签"],"forbidden":"绝对不要出现的内容(每行一条,用换行分隔)","tone":["语气1","语气2"],"persona":["人设1"],"selling_points":["卖点1","..."],"audience":["目标受众1"],"content_directions":[{"name":"内容方向名","description":"方向说明"}]}',
      'prompt 的写法：写成一段带【产品卖点】【人设】【目标受众】【产品知识】等占位符的写作要求(分段：开头钩子/正文要点/结尾引导)，占位符保持原样不要替换；mode 按策略定位选：品牌官号/专业账号=precise，素人/KOC/矩阵号=open；',
      hasKeys
        ? '要求：persona 1-2 条；selling_points 3-5 条且必须自然覆盖用户给的重要要点；audience 1-2 条；content_directions 1-3 个；'
        : '要求：persona 1-2 条；selling_points 3-5 条（从产品资料中提炼核心卖点与差异优势）；audience 1-2 条；content_directions 1-3 个；',
      hasAngle || hasView
        ? '语言口语化、符合门店员工真人表达，贴合产品信息与给定的写作角度/观点；只输出 JSON，不要其他文字。'
        : '语言口语化、符合门店员工真人表达，贴合产品信息，角度与观点由你从产品资料中提炼最合适的；只输出 JSON，不要其他文字。',
    ].join('\n');
    const user = [
      product ? `【产品】${product.displayName ?? product.name}` : '【产品】未指定',
      knowledge ? `【产品资料】${knowledge}` : '',
      hasAngle ? `【写作角度】${input.angle}` : '',
      hasView ? `【想表达的观点】${input.viewpoint}` : '',
      hasKeys ? `【必须覆盖的重要要点】${input.keyPoints}` : '',
    ]
      .filter(Boolean)
      .join('\n' + '\n');
    const draft = await this.chatJson<Record<string, unknown>>(system, user, 0.5);
    const dirs = Array.isArray(draft.content_directions)
      ? (draft.content_directions as Record<string, unknown>[])
          .map((d) => ({ name: String(d?.name ?? '').trim(), description: String(d?.description ?? '').trim() }))
          .filter((d) => d.name)
          .slice(0, 3)
      : [];
    const rawVisual = (draft.visual ?? {}) as Record<string, unknown>;
    const vCount = Number(rawVisual.count ?? 4);
    const bound = Array.isArray(draft.bound_product_ids)
      ? (draft.bound_product_ids as unknown[]).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)
      : input.productId
        ? [input.productId]
        : [];
    const reqTags = asArr(draft.required_tags).slice(0, 8).map((t) => (t.startsWith('#') ? t : '#' + t));
    return {
      name: String(draft.name ?? '').trim().slice(0, 30) || 'AI 生成的写作策略',
      description: String(draft.description ?? '').trim(),
      prompt: String(draft.prompt ?? '').trim(),
      mode: draft.mode === 'precise' ? 'precise' : 'open',
      format_text: String(draft.formatText ?? '').trim(),
      required_tags: reqTags,
      forbidden: String(draft.forbidden ?? '').trim(),
      tone: asArr(draft.tone).slice(0, 4),
      visual: {
        mode: rawVisual.mode === 'precise' ? 'precise' : 'random',
        count: Number.isInteger(vCount) && vCount >= 1 && vCount <= 9 ? vCount : 4,
        set_id: rawVisual.setId ? Number(rawVisual.setId) : null,
        slots: Array.isArray(rawVisual.slots)
          ? (rawVisual.slots as { tagId?: number; position?: string }[]).slice(0, 9) : [],
        },
      bound_product_ids: bound,
      persona: asArr(draft.persona).slice(0, 3),
      selling_points: asArr(draft.selling_points).slice(0, 8),
      audience: asArr(draft.audience).slice(0, 3),
      content_directions: dirs,
    };
  }

  async generateArticle(input: {
    brandId: number;
    productId: number;
    strategyId?: number | null;
    extra?: string;
    directionName?: string | null;
    wordCount?: string | null;
    noteKind?: string | null;
    style?: string | null;
    form?: string | null;
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
    const templates = await this.loadTemplates(input.brandId, product.id);
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
    const noteKind = input.noteKind && NOTE_KINDS[input.noteKind] ? input.noteKind : null;
    const style = input.style === 'brand' ? 'brand' : input.style === 'kos' ? 'kos' : null;
    const form = input.form === 'video_script' ? 'video_script' : 'image_text';
    // 策略框定：提示词模板(变量占位符替换) + 格式/必带标签/禁写/语气
    const sPromptTpl = String((strategy?.prompt as string) ?? '').trim();
    const sMode = String((strategy as { mode?: string } | null)?.mode ?? 'open');
    const sFormatText = String((strategy as { formatText?: string } | null)?.formatText ?? '').trim();
    const sRequiredTags = asArr(strategy?.requiredTags as unknown);
    const sForbidden = String((strategy as { forbiddenText?: string } | null)?.forbiddenText ?? '').trim();
    const sTone = asArr(strategy?.tone as unknown);
    const personaStr = persona.join('；');
    const spStr = sellingPoints.join('；');
    const auStr = audience.join('、');
    const replaceVars = (tpl: string) => {
      const map: Record<string, string> = {
        产品名称: productName,
        产品名: productName,
        产品卖点: spStr || '（卖点见下）',
        卖点: spStr || '（卖点见下）',
        产品知识: knowledge,
        产品资料: knowledge,
        人设: personaStr || (strategy?.name ?? ''),
        写作人设: personaStr || (strategy?.name ?? ''),
        目标受众: auStr,
        产品受众: auStr,
        钩子: '',
        写作风格: sMode === 'precise' ? '精准写作（约束强、随机性低、表述严格按提示词执行）' : '开放式写作（随机性高、更像素人真人分享）',
      };
      return tpl.replace(/【([^】]{1,14})】/g, (mm: string, key: string) => {
        const k = key.trim();
        for (const kk of Object.keys(map)) {
          if (k === kk) return map[kk];
          if (k.includes(kk) || kk.includes(k)) return map[kk];
        }
        return mm;
      });
    };
    const strategyPromptFilled = sPromptTpl ? replaceVars(sPromptTpl) : '';

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
          noteKind,
          style,
          form,
          templates,
          strategyPrompt: strategyPromptFilled,
          strategyMode: sMode,
          formatText: sFormatText,
          requiredTags: sRequiredTags,
          forbidden: sForbidden,
          tone: sTone,
        });
      } catch (e) {
        this.logger.warn(`LLM 生成失败回退模板: ${e?.message ?? e}`);
      }
    }
    const fallback = this.templateCompose({
      productName,
      strategyName: strategy?.name,
      persona,
      sellingPoints,
      audience,
      directionName,
      knowledge,
      extra: input.extra,
    });
    if (form === 'video_script') {
      fallback.script = this.fallbackScript(productName, sellingPoints);
    }
    return fallback;
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
    noteKind?: string | null;
    style?: string | null;
    form?: string | null;
    strategyPrompt?: string;
    strategyMode?: string;
    formatText?: string;
    requiredTags: string[];
    forbidden?: string;
    tone: string[];
    templates: { spec: { content: unknown } | null; vehicle: { content: unknown } | null; complianceTpl: { content: unknown } | null };
  }): Promise<GenerateResult> {
    const wc = ctx.wordCount ?? '300-600';
    const kindInfo = ctx.noteKind ? NOTE_KINDS[ctx.noteKind] : null;

    const sys: string[] = [];
    if (ctx.form === 'video_script') {
      sys.push('你是汽车门店短视频编导兼 KOS 销售写手，写抖音/小红书竖屏短视频口播脚本。');
      sys.push(
        '输出严格 JSON：{"titles":["标题1","标题2","标题3"],"content":"完整口播文稿","script":{"hook":"前3秒钩子台词","shots":[{"visual":"画面描述","voiceover":"该镜头口播台词"}],"cta":"结尾引导台词"},"tags":["标签1"]}',
      );
      sys.push(`要求：3-6 个镜头，总时长对应 ${wc} 字口播；hook 必须前 3 秒抓住人；`);
      sys.push('标签 4-6 个，# 后接关键词。');
    } else {
      sys.push('你是小红书 KOS 笔记写手，用门店销售第一人称口语化写作。');
      sys.push('输出严格 JSON：{"titles":["标题1","标题2","标题3"],"content":"正文","tags":["标签1",...]}');
      sys.push(`要求：标题 ≤20 字；正文 ${wc} 字，分段自然，可用 emoji 列卖点，结尾引导私信/到店；`);
      sys.push('标签 4-6 个，# 后接关键词。');
    }
    if (kindInfo) sys.push(`本篇是「${kindInfo.label}」：${kindInfo.guidance}`);
    if (ctx.style) sys.push(STYLE_GUIDANCE[ctx.style]);
    if (ctx.tone.length) sys.push(`语气偏向：${ctx.tone.join('、')}。`);
    if (ctx.strategyMode === 'precise') sys.push('本策略为「精准写作」：约束强、随机性低，结构与表述严格按策略提示词执行。');
    else if (ctx.strategyMode === 'open') sys.push('本策略为「开放式写作」：随机性高，更像素人真人随手分享，避免过度工整。');

    // 品牌话术规范（全局约束）
    const spec = ctx.templates.spec?.content as
      | { tone?: string; dos?: string[]; donts?: string[]; vocabulary?: string[] }
      | null
      | undefined;
    if (spec) {
      const lines: string[] = ['【品牌话术规范（必须遵守）】'];
      if (spec.tone) lines.push(`语气基调：${spec.tone}`);
      if (spec.dos?.length) lines.push(`必须做到：${spec.dos.join('；')}`);
      if (spec.donts?.length) lines.push(`禁止出现：${spec.donts.join('；')}`);
      if (spec.vocabulary?.length) lines.push(`优先用语：${spec.vocabulary.join('、')}`);
      sys.push(lines.join('\n'));
    }

    const user: string[] = [];
    user.push(`产品：${ctx.productName}`);
    if (ctx.strategyName) user.push(`创作策略（人设）：${ctx.strategyName}`);
    if (ctx.persona.length) user.push(`人设：${ctx.persona.join('；')}`);
    if (ctx.sellingPoints.length) user.push(`必须覆盖的卖点：\n- ${ctx.sellingPoints.join('\n- ')}`);
    if (ctx.audience.length) user.push(`目标受众：${ctx.audience.join('、')}`);
    if (ctx.directionName) {
      user.push(
        `内容方向：${ctx.directionName}${ctx.directionDescription ? `（${ctx.directionDescription}）` : ''}`,
      );
    }
    if (ctx.knowledge) user.push(`产品知识（节选）：\n${ctx.knowledge}`);
    if (ctx.strategyPrompt) user.push(`【策略提示词（最高优先级，逐条严格执行）】\n${ctx.strategyPrompt}`);
    if (ctx.formatText) user.push(`【格式框定（必须遵守）】\n${ctx.formatText}`);
    if (ctx.requiredTags.length) user.push(`【必带标签（正文自然提及，文末标签必须全部包含）】${ctx.requiredTags.join(' ')}`);
    if (ctx.forbidden) user.push(`【绝对禁止出现（违反任何一条即不合格）】\n${ctx.forbidden}`);

    // 车型内容模板（结构约束）
    const vehicle = ctx.templates.vehicle?.content as
      | { titlePatterns?: string[]; sections?: { name: string; requirement?: string }[]; cta?: string }
      | null
      | undefined;
    if (vehicle) {
      const lines: string[] = ['【车型内容模板（按此结构组织内容）】'];
      if (vehicle.titlePatterns?.length) lines.push(`标题参考句式：${vehicle.titlePatterns.join(' / ')}`);
      if (vehicle.sections?.length) {
        lines.push(
          `内容结构：${vehicle.sections
            .map((s) => `${s.name}${s.requirement ? `（${s.requirement}）` : ''}`)
            .join(' → ')}`,
        );
      }
      if (vehicle.cta) lines.push(`行动引导：${vehicle.cta}`);
      user.push(lines.join('\n'));
    }
    if (ctx.extra) user.push(`额外写作要求：${ctx.extra}`);

    const res = await fetch(`${this.llmBase()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.llmModel(),
        messages: [
          { role: 'system', content: sys.join('\n') },
          { role: 'user', content: user.join('\n') },
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
    let script: VideoScript | null = null;
    if (ctx.form === 'video_script') {
      const raw = (parsed as { script?: unknown }).script as VideoScript | undefined;
      if (raw && Array.isArray(raw.shots) && raw.shots.length) {
        script = raw;
      } else {
        // LLM 未按结构返回分镜时降级兜底（口播稿已在 content）
        script = this.fallbackScript(ctx.productName, ctx.sellingPoints);
      }
    }
    return { titles: parsed.titles, content: parsed.content, tags: parsed.tags, source: 'llm', script };
  }

  private parseLlmJson(text: string): { titles: string[]; content: string; tags: string[] } | null {
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

  private fallbackScript(productName: string, sellingPoints: string[]): VideoScript {
    const shots = sellingPoints.slice(0, 4).map((s, i) => ({
      visual: `${productName} ${i === 0 ? '外观环绕展示' : '细节/内饰特写'}`,
      voiceover: s,
    }));
    return {
      hook: `${productName}到底值不值？看完这条你再决定`,
      shots: shots.length ? shots : [{ visual: `${productName} 外观展示`, voiceover: '这台车卖点很多，到店我给你讲' }],
      cta: '想了解的评论区扣「看车」，或者直接私信我',
    };
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

  // ── 合规扫描 + AI 预审评分（有效率≥70%保障：出厂前闸门）────────────
  /**
   * 合规词库扫描：KnowledgeRule(category=compliance, enabled) 关键词/正则匹配。
   * pattern 支持两种写法：逗号或换行分隔的关键词组；或 /.../ 包裹的正则。
   */
  async scanCompliance(brandId: number, texts: string[]): Promise<PreReviewResult['ruleHits']> {
    const rules = await this.prisma.knowledgeRule.findMany({
      where: { brandId, category: 'compliance', enabled: true },
    });
    const target = texts.filter(Boolean).join('\n');
    const hits: PreReviewResult['ruleHits'] = [];
    for (const rule of rules) {
      let matched = '';
      const slash = rule.pattern.match(/^\/(.+)\/$/s);
      if (slash) {
        try {
          const re = new RegExp(slash[1], 'i');
          const m = target.match(re);
          if (m) matched = m[0];
        } catch {
          this.logger.warn(`合规规则正则非法: ${rule.name}`);
        }
      } else {
        const words = rule.pattern.split(/[,，\n]/).map((w) => w.trim()).filter(Boolean);
        matched = words.find((w) => target.includes(w)) ?? '';
      }
      if (matched) hits.push({ ruleId: rule.id, name: rule.name, action: rule.action, matched, replyHint: rule.replyHint ?? '' });
    }
    return hits;
  }

  /**
   * AI 预审评分：五维打分 + 合规规则扫描 → pass(≥75) / rewrite(60-74) / reject(<60)。
   * block 级规则命中直接 reject；flag 级命中封顶 74（强制重写）。
   */
  async preReview(input: {
    brandId: number;
    title: string;
    content: string;
    productName?: string;
    sellingPoints?: string[];
    noteKind?: string | null;
  }): Promise<PreReviewResult> {
    const ruleHits = await this.scanCompliance(input.brandId, [input.title, input.content]);
    const blocked = ruleHits.some((h) => h.action === 'block');
    const flagged = ruleHits.filter((h) => h.action !== 'block');

    let result: PreReviewResult;
    if (!this.enabled()) {
      // 无 LLM key：仅按规则扫描给结果（不阻塞生成主流程）
      result = {
        score: blocked ? 40 : flagged.length ? 70 : 80,
        verdict: blocked ? 'reject' : flagged.length ? 'rewrite' : 'pass',
        dims: { brandFit: 75, sellingAccuracy: 75, compliance: blocked ? 30 : flagged.length ? 60 : 85, originality: 75, platformFit: 75 },
        issues: flagged.map((h) => `命中合规规则「${h.name}」：${h.matched}`),
        suggestion: blocked ? '内容命中拦截级违禁词，已阻断，请修改后重试' : undefined,
        ruleHits,
      };
      return result;
    }
    try {
      const kindInfo = input.noteKind ? NOTE_KINDS[input.noteKind] : null;
      const sys = [
        '你是汽车品牌新媒体内容质检官，对 KOS 笔记做五维评分（各维 0-100 整数）：',
        'brandFit 品牌调性符合度（贴合品牌定调与话术规范）、sellingAccuracy 卖点准确性（无虚构夸大，卖点覆盖合理）、',
        'compliance 合规性（广告法/平台规则：绝对化用语、虚假承诺、价格违规表述等）、originality 原创度（非模板套话）、platformFit 平台适配度（小红书/抖音内容形态）。',
        '输出严格 JSON：{"total":0-100,"brandFit":0,"sellingAccuracy":0,"compliance":0,"originality":0,"platformFit":0,"issues":["问题1"],"suggestion":"改进建议"}',
      ].join('\n');
      type PreReviewLlmJson = {
        total?: unknown;
        brandFit?: unknown;
        sellingAccuracy?: unknown;
        compliance?: unknown;
        originality?: unknown;
        platformFit?: unknown;
        issues?: unknown;
        suggestion?: unknown;
      };
      const user = [
        input.productName ? `产品：${input.productName}` : '',
        kindInfo ? `笔记类型：${kindInfo.label}` : '',
        input.sellingPoints?.length ? `应覆盖卖点：${input.sellingPoints.join('；')}` : '',
        `标题：${input.title}`,
        `正文：\n${input.content.slice(0, 1600)}`,
      ]
        .filter(Boolean)
        .join('\n');
      const j = await this.chatJson<PreReviewLlmJson>(
        sys,
        user,
        0.2,
      );
      const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
      const dims = {
        brandFit: clamp(j.brandFit),
        sellingAccuracy: clamp(j.sellingAccuracy),
        compliance: clamp(j.compliance),
        originality: clamp(j.originality),
        platformFit: clamp(j.platformFit),
      };
      let score = clamp(j.total) || Math.round((dims.brandFit + dims.sellingAccuracy + dims.compliance + dims.originality + dims.platformFit) / 5);
      const issues: string[] = Array.isArray(j.issues) ? j.issues.map(String).slice(0, 8) : [];
      for (const h of flagged) issues.unshift(`命中合规规则「${h.name}」：${h.matched}`);
      if (flagged.length) score = Math.min(score, 74);
      if (blocked) {
        score = Math.min(score, 40);
        issues.unshift('命中拦截级违禁词');
      }
      const verdict: PreReviewResult['verdict'] = blocked || score < 60 ? 'reject' : score < 75 ? 'rewrite' : 'pass';
      result = {
        score,
        verdict,
        dims,
        issues,
        suggestion: String(j.suggestion ?? ''),
        ruleHits,
      };
    } catch (e) {
      // 预审失败不阻塞生成：按规则扫描结果降级给出
      this.logger.warn(`AI 预审失败降级: ${e?.message ?? e}`);
      result = {
        score: blocked ? 40 : flagged.length ? 70 : 78,
        verdict: blocked ? 'reject' : flagged.length ? 'rewrite' : 'pass',
        dims: { brandFit: 78, sellingAccuracy: 78, compliance: blocked ? 30 : flagged.length ? 60 : 85, originality: 78, platformFit: 78 },
        issues: flagged.map((h) => `命中合规规则「${h.name}」：${h.matched}`),
        suggestion: 'AI 预审暂不可用，已按合规词库扫描，请人工终审把关',
        ruleHits,
      };
    }
    return result;
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
