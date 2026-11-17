// 运营报表服务：日报（内容产出/私信接待聚合）+ 月度维护与策略迭代报告（LLM 组稿）
// 定时器仿 spark.service 模式（setInterval + env 开关）；REPORT_ENABLED=1 才启用，默认关闭
// 日报推送复用 spark 的 WeCom webhook 模式（WECOM_WEBHOOK_URL 未配置时只落库不推送）
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chatText, llmEnabled } from '../hotspot/llm.util';

interface WindowAgg {
  contentCreated: number;
  contentApproved: number;
  avgAiScore: number | null;
  aiRewrite: number;
  aiReject: number;
  dmSessions: number;
  dmLeads: number;
  dmComments: number;
}

@Injectable()
export class ReportService implements OnModuleInit {
  private readonly logger = new Logger(ReportService.name);
  private ticking = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.REPORT_ENABLED !== '1') {
      this.logger.log('report timer disabled (set REPORT_ENABLED=1 to enable)');
      return;
    }
    setTimeout(() => this.tick().catch(() => undefined), 30_000).unref();
    setInterval(() => this.tick().catch(() => undefined), 60 * 60 * 1000).unref();
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = new Date();
      const hour = Number(now.toLocaleString('en-CN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }));
      const dailyHour = Number(process.env.REPORT_DAILY_HOUR ?? 20);
      if (hour !== dailyHour) return;
      const brands = await this.targetBrands();
      for (const brandId of brands) {
        await this.generateDaily(brandId).catch((e) => this.logger.warn(`daily report brand${brandId}: ${e?.message ?? e}`));
        const day = Number(now.toLocaleString('en-CN', { day: '2-digit', timeZone: 'Asia/Shanghai' }));
        if (day === Number(process.env.REPORT_MONTHLY_DAY ?? 1)) {
          await this.generateMonthly(brandId).catch((e) => this.logger.warn(`monthly report brand${brandId}: ${e?.message ?? e}`));
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  /** 报表目标品牌：REPORT_BRANDS 显式指定优先；否则取近 30 天有内容产出的品牌 */
  private async targetBrands(): Promise<number[]> {
    const env = (process.env.REPORT_BRANDS ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (env.length) return env;
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.xhsHistory.groupBy({
      by: ['brandId'],
      where: { uploadTime: { gte: since } },
    });
    return rows.map((r) => r.brandId);
  }

  private beijingWindow(dayStr: string): { start: Date; end: Date } {
    const start = new Date(`${dayStr}T00:00:00+08:00`);
    return { start, end: new Date(start.getTime() + 86400000) };
  }

  private async aggregate(brandId: number, start: Date, end: Date): Promise<WindowAgg> {
    const [contentCreated, contentApproved, scored, dmSessions, dmLeads, dmComments] = await Promise.all([
      this.prisma.xhsHistory.count({ where: { brandId, uploadTime: { gte: start, lt: end } } }),
      this.prisma.xhsHistory.count({ where: { brandId, uploadTime: { gte: start, lt: end }, reviewStatus: 'approved' } }),
      this.prisma.xhsHistory.findMany({
        where: { brandId, uploadTime: { gte: start, lt: end }, aiScore: { not: null } },
        select: { aiScore: true },
      }),
      this.prisma.laiguLead.count({ where: { brandId, createdAt: { gte: start, lt: end } } }),
      this.prisma.laiguLead.count({ where: { brandId, createdAt: { gte: start, lt: end }, isResource: true } }),
      this.prisma.laiguComment.count({ where: { brandId, createdAt: { gte: start, lt: end } } }),
    ]);
    const scores = scored.map((r) => r.aiScore ?? 0);
    const rewriteRows = await this.prisma.xhsHistory.count({
      where: { brandId, uploadTime: { gte: start, lt: end }, aiAudit: { path: ['verdict'], equals: 'rewrite' } },
    });
    const rejectRows = await this.prisma.xhsHistory.count({
      where: { brandId, uploadTime: { gte: start, lt: end }, aiAudit: { path: ['verdict'], equals: 'reject' } },
    });
    return {
      contentCreated,
      contentApproved,
      avgAiScore: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      aiRewrite: rewriteRows,
      aiReject: rejectRows,
      dmSessions,
      dmLeads,
      dmComments,
    };
  }

  private renderDailyMd(brandId: number, dayStr: string, a: WindowAgg): string {
    return [
      `### 运营日报（${dayStr}）`,
      `**内容生产**：生成 ${a.contentCreated} 篇，审核通过 ${a.contentApproved} 篇${a.avgAiScore != null ? `，AI 预审均分 ${a.avgAiScore}` : ''}；预审重写 ${a.aiRewrite} / 驳回 ${a.aiReject}`,
      `**私信接待**：新会话 ${a.dmSessions} 个，留资 ${a.dmLeads} 条，评论 ${a.dmComments} 条`,
      `—— ${brandId} 工作区（马克听自动生成）`,
    ].join('\n');
  }

  private async pushWecom(md: string) {
    const url = process.env.WECOM_WEBHOOK_URL;
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md.slice(0, 4000) } }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateDaily(brandId: number, dayStr?: string) {
    const day = dayStr ?? new Date(Date.now() - 86400000).toLocaleString('en-CA', { timeZone: 'Asia/Shanghai' });
    const { start, end } = this.beijingWindow(day);
    const agg = await this.aggregate(brandId, start, end);
    const title = `运营日报 ${day}`;
    const md = this.renderDailyMd(brandId, day, agg);
    const row = await this.prisma.brandReport.upsert({
      where: { brandId_type_period: { brandId, type: 'daily', period: day } },
      create: { brandId, type: 'daily', period: day, title, contentMd: md, meta: agg as never },
      update: { title, contentMd: md, meta: agg as never },
    });
    await this.pushWecom(md);
    return row;
  }

  async generateMonthly(brandId: number, periodStr?: string) {
    const period =
      periodStr ??
      new Date(Date.now() - 15 * 86400000).toLocaleString('en-CA', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
    const start = new Date(`${period}-01T00:00:00+08:00`);
    const end = new Date(start.getTime() + 31 * 86400000);
    const agg = await this.aggregate(brandId, start, end);
    const dealers = await this.prisma.koxDealerSnapshot.findMany({
      where: { brandId, statMonth: period },
      orderBy: { score: 'desc' },
      take: 10,
    });
    const headline = dealers.length
      ? dealers
          .map((d) => `${d.dealerName}（${d.regionName ?? '-'}）：发布 ${d.publishCnt} / 曝光 ${d.exposure} / 留资 ${d.leads} / 得分 ${d.score ?? '-'}`)
          .join('\n')
      : '本月暂无经销商月度快照数据。';
    let md = [
      `### 月度维护与策略迭代报告（${period}）`,
      `**内容生产**：生成 ${agg.contentCreated} 篇 / 通过 ${agg.contentApproved} 篇 / AI 预审均分 ${agg.avgAiScore ?? '-'}；预审重写 ${agg.aiRewrite} / 驳回 ${agg.aiReject}（有效率保障：不合格内容出厂前拦截）`,
      `**私信接待**：会话 ${agg.dmSessions} / 留资 ${agg.dmLeads} / 评论 ${agg.dmComments}`,
      '',
      '**经销商表现 TOP10**',
      headline,
    ].join('\n');
    // LLM 策略迭代建议（失败不影响报告落库）
    if (llmEnabled()) {
      try {
        const advice = await chatText(
          '你是汽车品牌 KOS 运营顾问。基于给定的月度运营数据，输出 3-5 条下月的策略迭代与维护建议， markdown 列表，每条一句话，务实可执行，不要空话。',
          md.slice(0, 2500),
          { temperature: 0.4 },
        );
        if (advice) md += `\n\n**下月策略迭代建议**\n${advice.trim().slice(0, 1200)}`;
      } catch {
        // LLM 失败只保留数据段
      }
    }
    const title = `月度维护与策略迭代报告 ${period}`;
    const row = await this.prisma.brandReport.upsert({
      where: { brandId_type_period: { brandId, type: 'monthly', period } },
      create: { brandId, type: 'monthly', period, title, contentMd: md, meta: { ...agg, dealers: dealers.length } as never },
      update: { title, contentMd: md, meta: { ...agg, dealers: dealers.length } as never },
    });
    return row;
  }

  // ─── 查询 ────────────────────────────────────────────────────────
  async list(brandId: number, query: { type?: string; page?: string; pageSize?: string }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Number(query.pageSize ?? 20) || 20);
    const where = { brandId, ...(query.type ? { type: query.type } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.brandReport.count({ where }),
      this.prisma.brandReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, type: true, period: true, title: true, createdAt: true },
      }),
    ]);
    return { list: rows, total, page, page_size: pageSize };
  }

  async detail(brandId: number, id: number) {
    const row = await this.prisma.brandReport.findUnique({ where: { id } });
    if (!row || row.brandId !== brandId) throw new Error('报表不存在');
    return row;
  }
}
