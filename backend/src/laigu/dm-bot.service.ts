// 智能私信机器人（东风日产建设项，2026-11-18）
// 链路：syncLeads 入库 → safeSync 钩子触发 processEnabledBrands → 意图识别/意向打标
//       → 回复编排（上下文+产品知识+人设 → LLM → 合规拦截）→ 发送适配器（dry-run 默认，只记录不外发）
// 发送通道：LAIGU_SEND_ENDPOINT 未确认前全程 dry-run；确认后在 send() 接 gateway 实现
import { Injectable, Logger } from '@nestjs/common';
import { DmConfig, LaiguLead, LaiguMessage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../contentpro/ai.service';
import { chatText, llmEnabled } from '../hotspot/llm.util';

const INTENT_LEVEL_ORDER: Record<string, number> = { C: 1, B: 2, A: 3, H: 4 };

interface IntentResult {
  intent: string;
  leadLevel: string;
  confidence?: number;
  reason?: string;
  via: 'rule' | 'llm' | 'hybrid';
}

type DmConfigLike = DmConfig;
type LeadLike = LaiguLead;
type MsgLike = LaiguMessage;

@Injectable()
export class DmBotService {
  private readonly logger = new Logger(DmBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ─── 入口：safeSync 后调用，处理所有开启 DM 的品牌 ──────────────────
  async processEnabledBrands() {
    const cfgs = await this.prisma.dmConfig.findMany({ where: { enabled: true } });
    for (const cfg of cfgs) {
      await this.processBrand(cfg.brandId).catch((e) =>
        this.logger.warn(`dm-bot brand${cfg.brandId}: ${(e as Error).message}`),
      );
    }
  }

  /** 处理单品牌：找「最后一条是客户消息且尚未被回复」的会话逐个接待 */
  async processBrand(brandId: number, opts?: { sessionId?: string; limit?: number }) {
    const cfg = await this.ensureConfig(brandId);
    if (!cfg.enabled) return { skipped: 'disabled', processed: 0 };
    const where: Prisma.LaiguLeadWhereInput = {
      brandId,
      humanTakenOver: false,
      clientMessageCount: { gt: 0 },
    };
    if (opts?.sessionId) where.sessionId = opts.sessionId;
    const leads = await this.prisma.laiguLead.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: Math.min(60, opts?.limit ?? 40),
    });
    let processed = 0;
    const logs: { sessionId: string; status: string; intent: string | null; leadLevel: string | null }[] = [];
    for (const lead of leads) {
      try {
        const msgs = await this.prisma.laiguMessage.findMany({
          where: { sessionId: lead.sessionId },
          orderBy: [{ sentAt: 'asc' }, { seq: 'asc' }],
          take: 80,
        });
        const last = msgs[msgs.length - 1];
        if (!last || last.role !== 'client') continue; // 最后一条不是客户消息 = 已被接待
        // 幂等：同一条触发消息已处理过则跳过
        const dup = await this.prisma.dmReplyLog.findFirst({
          where: {
            sessionId: lead.sessionId,
            triggerMsgAt: last.sentAt ?? undefined,
            draft: { not: '' },
          },
          select: { id: true },
        });
        if (dup) continue;
        const log = await this.processLead(cfg, lead, msgs);
        logs.push({ sessionId: lead.sessionId, status: log.status, intent: log.intent, leadLevel: log.leadLevel });
        processed += 1;
      } catch (e) {
        this.logger.warn(`dm-bot session ${lead.sessionId}: ${(e as Error).message}`);
      }
    }
    return { processed, logs };
  }

  // ─── 单会话接待：意图 → 打标 → 通知 → 回复编排 → 发送 ───────────────
  private async processLead(cfg: DmConfigLike, lead: LeadLike, msgs: MsgLike[]) {
    const brandId = cfg.brandId;
    const lastClient = [...msgs].reverse().find((m) => m.role === 'client');
    const clientText = lastClient?.contentType === 'text' || !lastClient?.contentType
      ? lastClient?.contentText ?? lastClient?.content ?? ''
      : `[卡片消息] ${lastClient?.contentText ?? ''}`;

    // 1. 意图识别 + 意向打标（规则打底，LLM 精修；等级取两者高者）
    const intent = await this.classify(cfg, lead, clientText);
    const wasHigh = lead.intentLevel === 'H';
    if (lead.intentLevel !== intent.leadLevel || !lead.intentTags) {
      await this.prisma.laiguLead.update({
        where: { id: lead.id },
        data: {
          intentLevel: intent.leadLevel,
          intentTags: { intent: intent.intent, confidence: intent.confidence ?? null, reason: intent.reason ?? null, via: intent.via },
          intentAt: new Date(),
        },
      });
    }
    // 高意向且是新晋 H：企微通知
    if (intent.leadLevel === 'H' && !wasHigh && cfg.notifyWecom) {
      await this.notifyHighIntent(brandId, lead, intent, clientText);
    }

    // 2. 是否自动回复
    if (!cfg.autoReply || intent.intent === '投诉反馈') {
      return this.writeLog(cfg, lead, lastClient?.sentAt ?? null, '', '', intent, null, 'suppressed', {
        reason: cfg.autoReply ? '投诉/负面自动回避' : '自动回复已关闭',
      });
    }

    // 3. 回复编排：上下文 + 产品知识 + 人设 → LLM
    const turns = cfg.contextTurns;
    const recent = msgs.slice(-turns);
    const transcript = recent
      .map((m) => `${m.role === 'client' ? '客户' : m.senderName || '客服'}：${(m.contentType === 'text' || !m.contentType ? m.contentText ?? m.content ?? '' : `[卡片] ${m.contentText ?? ''}`).slice(0, 160)}`)
      .join('\n');
    const knowledge = await this.matchKnowledge(brandId, clientText + ' ' + transcript.slice(-400));
    const persona = await this.buildPersona(cfg, lead);

    const sys = [
      persona ? `你是汽车门店的销售顾问，人设：${persona}。` : '你是汽车门店的销售顾问。',
      '回复要求：口语化、简短（80 字以内）、一条消息；不承诺具体价格与权益（引导私信/到店获取）；不贬低竞品；不用绝对化用语（最好/第一/绝对等）；',
      '自然延续对话语境，适时引导留资或到店试驾；客户问知识库里没有的内容就引导到店咨询，不要编造。',
    ].join('');
    const user = [
      knowledge ? `产品知识（参考，禁止编造超出的内容）：\n${knowledge}` : '',
      `最近对话：\n${transcript}`,
      `请以销售身份回复客户最后一条消息：「${clientText.slice(0, 200)}」`,
    ].filter(Boolean).join('\n\n');

    const t0 = Date.now();
    let draft = '';
    if (llmEnabled()) {
      try {
        draft = (await chatText(sys, user, { temperature: 0.6 })).trim();
      } catch (e) {
        this.logger.warn(`dm-bot llm: ${(e as Error).message}`);
      }
    }
    if (!draft) {
      return this.writeLog(cfg, lead, lastClient?.sentAt ?? null, '', '', intent, null, 'suppressed', {
        reason: 'LLM 不可用，未生成回复',
      });
    }

    // 4. 合规前置拦截（命中 block 改写一次，改不掉用引导话术兜底）
    const ruleHits = await this.ai.scanCompliance(brandId, [draft]);
    let finalContent = draft;
    let status = cfg.dryRun ? 'dry_run' : 'sent';
    if (ruleHits.some((h) => h.action === 'block')) {
      const retry = await chatText(
        `${sys}\n重要：上一版包含违禁词，绝对禁止使用这些词：${ruleHits.map((h) => h.matched).join('、')}。请重新回复。`,
        user,
        { temperature: 0.5 },
      ).then((s) => s.trim()).catch(() => '');
      const retryHits = retry ? await this.ai.scanCompliance(brandId, [retry]) : [];
      if (retry && !retryHits.some((h) => h.action === 'block')) {
        finalContent = retry;
        ruleHits.push(...retryHits);
      } else {
        const hint = ruleHits.find((h) => h.replyHint)?.replyHint
          ?? '具体价格以门店当期政策为准，我可以帮您算一份精准的落地价，您方便留个联系方式或者到店聊聊吗？';
        finalContent = hint;
        status = 'blocked';
      }
    } else {
      ruleHits.push(...ruleHits.filter((h) => h.action !== 'block'));
    }

    // 5. 发送适配器（dry-run 只记录；真发送待来鼓 send 端点接入）
    const sendResult = await this.send(cfg, lead.sessionId, finalContent);
    if (!sendResult.dryRun && !sendResult.ok) status = 'channel_missing';

    // 6. 落日志；真实发送成功才写 SLA 字段（dry-run 不算真实回复）
    const log = await this.writeLog(cfg, lead, lastClient?.sentAt ?? null, draft, finalContent, intent, ruleHits, status, {
      latencyMs: Date.now() - t0,
    });
    if (!cfg.dryRun && sendResult.ok) {
      const now = new Date();
      await this.prisma.laiguLead.update({
        where: { id: lead.id },
        data: {
          autoRepliedAt: lead.autoRepliedAt ?? now,
          firstReplyAt: lead.firstReplyAt ?? now,
          replyBy: lead.firstReplyAt ? lead.replyBy : 'bot',
        },
      });
    }
    return log;
  }

  // ─── 意图识别：规则打底（留资/试驾=H，价格类=A/B），LLM 精修 ─────────
  private async classify(cfg: { brandId: number }, lead: Pick<LeadLike, 'isResource' | 'phone'>, clientText: string): Promise<IntentResult> {
    let level = 'C';
    const ruleReasons: string[] = [];
    if (lead.isResource || lead.phone) {
      level = 'H';
      ruleReasons.push(lead.isResource ? '已留资' : '已留电话');
    }
    if (/试驾|约看车|到店|来看车|预约/.test(clientText)) {
      level = INTENT_LEVEL_ORDER.H > INTENT_LEVEL_ORDER[level] ? 'H' : level;
      ruleReasons.push('提及试驾/到店');
    } else if (/价格|多少钱|优惠|落地|报价|免息|金融|贷款/.test(clientText)) {
      level = INTENT_LEVEL_ORDER.A > INTENT_LEVEL_ORDER[level] ? 'A' : level;
      ruleReasons.push('询价/金融意向');
    }
    if (!llmEnabled()) {
      return { intent: ruleReasons.length ? '价格咨询' : '闲聊浏览', leadLevel: level, reason: ruleReasons.join('；') || '关键词规则', via: 'rule' };
    }
    try {
      const j = await chatText(
        '你是汽车门店私信意图分类器。对最后一条客户消息分类：intent 取 询价/车型咨询/试驾邀约/金融政策/竞品对比/售后维保/投诉反馈/闲聊浏览 之一；leadLevel 取 H(留资/试驾/要电话)/A(问价/聊具体配置)/B(泛咨询)/C(闲聊) 之一。',
        `客户留资: ${lead.isResource ? '是' : '否'}；留电话: ${lead.phone ? '是' : '否'}\n最后消息: ${clientText.slice(0, 300)}`,
        { temperature: 0.2 },
      );
      const m = j.match(/\{[\s\S]*\}/);
      const o = m ? (JSON.parse(m[0]) as { intent?: string; leadLevel?: string; confidence?: number; reason?: string }) : null;
      const llmLevel = ['H', 'A', 'B', 'C'].includes(o?.leadLevel ?? '') ? o!.leadLevel! : 'C';
      const finalLevel = INTENT_LEVEL_ORDER[llmLevel] >= INTENT_LEVEL_ORDER[level] ? llmLevel : level;
      return {
        intent: o?.intent ?? (ruleReasons.length ? '价格咨询' : '闲聊浏览'),
        leadLevel: finalLevel,
        confidence: o?.confidence,
        reason: [o?.reason, ...ruleReasons].filter(Boolean).join('；'),
        via: 'hybrid',
      };
    } catch {
      return { intent: ruleReasons.length ? '价格咨询' : '闲聊浏览', leadLevel: level, reason: ruleReasons.join('；') || 'LLM 不可用，关键词规则', via: 'rule' };
    }
  }

  // ─── 产品知识检索（轻量：对话命中车系名 → 该车系 knowledge/faq）──────
  private async matchKnowledge(brandId: number, text: string) {
    const products = await this.prisma.product.findMany({
      where: { brandId, configType: 'product' },
      select: { id: true, name: true, displayName: true, knowledge: true, faq: true },
    });
    const hits = products.filter((p) => text.includes(p.name) || (p.displayName && text.includes(p.displayName)));
    if (!hits.length) return '';
    return hits
      .slice(0, 2)
      .map((p) => `【${p.displayName ?? p.name}】${(p.knowledge ?? '').slice(0, 300)}\nFAQ: ${(p.faq ?? '').slice(0, 200)}`)
      .join('\n')
      .slice(0, 900);
  }

  // ─── 人设：账号覆盖优先，回退品牌模板 ─────────────────────────────
  private async buildPersona(cfg: Pick<DmConfigLike, 'personaTemplateId' | 'personaOverrides' | 'brandId'>, lead: Pick<LeadLike, 'subSource'>) {
    const overrides = (cfg.personaOverrides ?? {}) as Record<string, number>;
    const templateId = (lead.subSource && overrides[lead.subSource]) || cfg.personaTemplateId;
    if (!templateId) return '';
    const tpl = await this.prisma.brandTemplate.findFirst({
      where: { id: templateId, brandId: cfg.brandId, kind: 'persona', status: 1 },
    });
    if (!tpl) return '';
    const c = (tpl.content ?? {}) as { identity?: string; traits?: string[]; expertise?: string[]; expressions?: string[] };
    return [
      c.identity,
      c.traits?.length ? `性格：${c.traits.join('、')}` : '',
      c.expertise?.length ? `专业：${c.expertise.join('、')}` : '',
      c.expressions?.length ? `表达习惯：${c.expressions.join('；')}` : '',
    ].filter(Boolean).join('；');
  }

  // ─── 高意向企微通知（H 新晋时一次）────────────────────────────────
  private async notifyHighIntent(brandId: number, lead: LeadLike, intent: IntentResult, clientText: string) {
    const url = process.env.WECOM_WEBHOOK_URL;
    if (!url) return;
    let accountName = '';
    if (lead.subSource) {
      const acc = await this.prisma.kosAccount.findFirst({
        where: { brandId, authorUrl: { contains: lead.subSource } },
        select: { nickname: true },
      });
      accountName = acc?.nickname ?? '';
    }
    const md = [
      `**🔥 高意向线索提醒**`,
      `客户：${lead.clientName ?? '-'}${lead.phone ? `（电话 ${lead.phone}）` : ''}${accountName ? ` / 进线账号：${accountName}` : ''}`,
      `意向：${intent.intent}（${intent.leadLevel} 级）`,
      `消息：${(lead.lastClientContent ?? clientText).slice(0, 80)}`,
      `请尽快在工作台跟进（3 分钟回复 SLA）`,
    ].join('\n');
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md.slice(0, 4000) } }),
      });
    } catch {
      // 通知失败不阻塞主流程
    }
  }

  // ─── 发送适配器：dry-run 只记录；真发送待通道接入 ─────────────────
  private async send(cfg: { dryRun: boolean }, _sessionId: string, _content: string): Promise<{ ok: boolean; dryRun: boolean; error?: string }> {
    if (cfg.dryRun) return { ok: true, dryRun: true };
    // TODO(通道 Spike)：来鼓 send 端点确认后在此实现 gateway 发送（网关 token 通道）
    return { ok: false, dryRun: false, error: '发送通道未接入（待来鼓 send 端点确认）' };
  }

  private async writeLog(
    cfg: Pick<DmConfigLike, 'brandId'>,
    lead: Pick<LeadLike, 'sessionId'>,
    triggerMsgAt: Date | null,
    draft: string,
    finalContent: string,
    intent: IntentResult,
    ruleHits: unknown,
    status: string,
    aiMeta?: Record<string, unknown>,
  ) {
    return this.prisma.dmReplyLog.create({
      data: {
        brandId: cfg.brandId,
        sessionId: lead.sessionId,
        triggerMsgAt,
        draft: draft.slice(0, 2000),
        finalContent: finalContent ? finalContent.slice(0, 2000) : null,
        status,
        intent: intent.intent,
        leadLevel: intent.leadLevel,
        ruleHits: (ruleHits as Prisma.InputJsonValue) ?? undefined,
        aiMeta: (aiMeta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  // ─── 配置 ────────────────────────────────────────────────────────
  async ensureConfig(brandId: number) {
    let cfg = await this.prisma.dmConfig.findUnique({ where: { brandId } });
    if (!cfg) {
      cfg = await this.prisma.dmConfig.create({ data: { brandId } });
    }
    return cfg;
  }

  async updateConfig(brandId: number, dto: {
    enabled?: boolean;
    autoReply?: boolean;
    dryRun?: boolean;
    slaMinutes?: number;
    contextTurns?: number;
    personaTemplateId?: number | null;
    personaOverrides?: Record<string, number> | null;
    notifyWecom?: boolean;
  }) {
    await this.ensureConfig(brandId);
    const data: Prisma.DmConfigUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.autoReply !== undefined) data.autoReply = dto.autoReply;
    if (dto.dryRun !== undefined) data.dryRun = dto.dryRun;
    if (dto.slaMinutes !== undefined) data.slaMinutes = Math.max(1, Math.min(60, Number(dto.slaMinutes)));
    if (dto.contextTurns !== undefined) data.contextTurns = Math.max(2, Math.min(30, Number(dto.contextTurns)));
    if (dto.personaTemplateId !== undefined) data.personaTemplateId = dto.personaTemplateId;
    if (dto.personaOverrides !== undefined) data.personaOverrides = dto.personaOverrides as Prisma.InputJsonValue;
    if (dto.notifyWecom !== undefined) data.notifyWecom = dto.notifyWecom;
    return this.prisma.dmConfig.update({ where: { brandId }, data });
  }

  // ─── 回复日志查询 ────────────────────────────────────────────────
  async replyLogs(brandId: number, query: { sessionId?: string; page?: string; pageSize?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.pageSize ?? 20) || 20);
    const where: Prisma.DmReplyLogWhereInput = {
      brandId,
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.dmReplyLog.count({ where }),
      this.prisma.dmReplyLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { list: rows, total, page, page_size: pageSize };
  }

  // ─── SLA 统计：按客户首条消息日聚合（firstClientAt → firstReplyAt）──
  async slaStats(brandId: number, days = 7) {
    const since = new Date(Date.now() - Math.max(1, days) * 86400000);
    const leads = await this.prisma.laiguLead.findMany({
      where: { brandId, firstClientAt: { gte: since } },
      select: { firstClientAt: true, firstReplyAt: true, replyBy: true, intentLevel: true },
    });
    const slaMs = (await this.ensureConfig(brandId)).slaMinutes * 60_000;
    const byDay = new Map<string, { sessions: number; within: number; over: number; unanswered: number; bot: number; human: number; replySecs: number[] }>();
    for (const l of leads) {
      if (!l.firstClientAt) continue;
      const day = new Date(l.firstClientAt.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      const row = byDay.get(day) ?? { sessions: 0, within: 0, over: 0, unanswered: 0, bot: 0, human: 0, replySecs: [] };
      row.sessions += 1;
      if (!l.firstReplyAt) row.unanswered += 1;
      else {
        const sec = Math.round((l.firstReplyAt.getTime() - l.firstClientAt.getTime()) / 1000);
        row.replySecs.push(sec);
        if (sec <= slaMs / 1000) row.within += 1;
        else row.over += 1;
        if (l.replyBy === 'bot') row.bot += 1;
        else row.human += 1;
      }
      byDay.set(day, row);
    }
    const list = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, r]) => ({
        day,
        sessions: r.sessions,
        within_sla: r.within,
        over_sla: r.over,
        unanswered: r.unanswered,
        bot_replied: r.bot,
        human_replied: r.human,
        avg_first_reply_sec: r.replySecs.length ? Math.round(r.replySecs.reduce((s, x) => s + x, 0) / r.replySecs.length) : null,
        sla_rate: r.within + r.over > 0 ? Math.round((r.within / (r.within + r.over)) * 100) : null,
      }));
    return { list, sla_minutes: slaMs / 60000 };
  }
}
