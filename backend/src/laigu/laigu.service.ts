import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { extractKeywords } from '../common/text-keywords';
import { LaiguApiClient, LaiguSession } from './laigu-api.client';

const MAX_PAGES_PER_SYNC = 100;
const SYNC_OVERLAP_SECONDS = 3600;
const MAX_WINDOW_SECONDS = 29 * 24 * 3600;
const LAIGU_BRAND_ID = 5;
/** Morgandada 投放账户白名单（逗号分隔，env 可覆盖） */
const MDD_ADVERTISERS = (process.env.LAIGU_MDD_ADVERTISERS ?? 'Morgan DaDa-种草')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

@Injectable()
export class LaiguService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LaiguService.name);
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  /** MDD 账号匹配集缓存（小红书 userid + 客服昵称），5 分钟刷新 */
  private mddSetsCache: { userIds: Set<string>; nicknames: Set<string>; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: LaiguApiClient,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const minutes = Number(this.configService.get<string>('LAIGU_SYNC_INTERVAL_MINUTES') ?? 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('来鼓定时同步已禁用（LAIGU_SYNC_INTERVAL_MINUTES<=0）');
      return;
    }
    setTimeout(() => {
      this.safeSync().catch(() => undefined);
    }, 5_000).unref();
    this.syncTimer = setInterval(() => {
      this.safeSync().catch(() => undefined);
    }, minutes * 60_000);
    this.syncTimer.unref();
    this.logger.log(`来鼓定时同步已启动：每 ${minutes} 分钟`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  private async safeSync() {
    // 评论同步（网关 token 通道）——反馈分析页数据源；token 过期时账密自动重登一次再重试
    try {
      const cfg = await this.prisma.laiguOrgConfig.findUnique({ where: { brandId: 6 } });
      if (cfg?.gatewayToken && cfg.active) {
        try {
          const r = await this.syncComments(6);
          if (r.upserted > 0) this.logger.log(`来鼓评论同步完成：upsert ${r.upserted}`);
        } catch (error) {
          this.logger.warn(`来鼓评论同步失败，尝试账密自动重登: ${(error as Error).message}`);
          const token = await this.laiguAutoRelogin();
          if (!token) throw error;
          const r = await this.syncComments(6);
          this.logger.log(`来鼓评论同步完成（自动重登后）：upsert ${r.upserted}`);
        }
      }
    } catch (error) {
      this.logger.warn(`来鼓评论同步失败: ${(error as Error).message}`);
    }
    // 会话同步（OpenAPI）
    try {
      const result = await this.syncLeads();
      this.logger.log(`来鼓增量同步完成：拉取 ${result.fetched} 条`);
    } catch (error) {
      this.logger.warn(`来鼓定时同步失败: ${(error as Error).message}`);
    }
  }

  /** 来鼓网关 token 过期时：账密自动登录 pro.laigu.com 换新（凭据 LAIGU_LOGIN_USER/LAIGU_LOGIN_PASSWORD，未配置则维持人工路径） */
  private async laiguAutoRelogin(): Promise<string | null> {
    const user = this.configService.get<string>('LAIGU_LOGIN_USER') ?? '';
    const pass = this.configService.get<string>('LAIGU_LOGIN_PASSWORD') ?? '';
    if (!user || !pass) {
      this.logger.warn('来鼓 token 过期，且未配置 LAIGU_LOGIN_USER/LAIGU_LOGIN_PASSWORD，无法自动重登');
      return null;
    }
    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    const exe = (() => {
      try {
        const p = chromium.executablePath();
        if (p && fs.existsSync(p)) return p;
      } catch { /* fallthrough */ }
      const base = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
        : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
      try {
        const dirs = fs
          .readdirSync(base)
          .filter((d) => d.startsWith('chromium-'))
          .sort()
          .reverse();
        for (const d of dirs) {
          for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe']) {
            const fp = path.join(base, d, sub);
            if (fs.existsSync(fp)) return fp;
          }
        }
      } catch { /* ignore */ }
      return null;
    })();
    const browser = await chromium.launch({
      executablePath: exe || undefined,
      headless: true,
      args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
    });
    try {
      const ctx = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'zh-CN',
        viewport: { width: 1600, height: 1000 },
      });
      const page = await ctx.newPage();
      await page
        .goto('https://pro.laigu.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 })
        .catch(() => {});
      await page.waitForTimeout(5000);
      if (/login|passport/i.test(page.url()) || (await page.locator('input[type="password"]').count())) {
        const u = page
          .locator('input[type="text"], input[placeholder*="手机"], input[placeholder*="账号"]')
          .locator('visible=true')
          .first();
        const pw = page.locator('input[type="password"]').locator('visible=true').first();
        await u.fill(user, { timeout: 15000 });
        await pw.fill(pass, { timeout: 15000 });
        const agree = page.locator('text=同意').first();
        if (await agree.count()) {
          const box = await agree.boundingBox({ timeout: 2000 }).catch(() => null);
          if (box) await page.mouse.click(box.x - 18, box.y + box.height / 2).catch(() => {});
        }
        const btn = page.locator('button:has-text("登")').first();
        if (await btn.count()) await btn.click({ timeout: 8000 }).catch(() => {});
        else await page.keyboard.press('Enter');
        await page.waitForTimeout(8000);
      }
      if (/login|passport/i.test(page.url())) {
        throw new Error('来鼓自动登录未成功（可能触发滑块/验证码，请人工登录后推送 token）');
      }
      const token = await page.evaluate(() => localStorage.getItem('token') || '');
      const agentId = await page.evaluate(() => localStorage.getItem('agentId') || '');
      if (token.length < 32) throw new Error('来鼓自动登录 token 异常');
      await this.saveGatewayToken(6, token, agentId || undefined);
      this.logger.log(`来鼓自动重登成功，token 已热更+落库（agentId=${agentId || '-'}）`);
      return token;
    } finally {
      await browser.close();
    }
  }

  // ─── 来鼓网关（工作台 API，token 鉴权）：评论同步 ────────────────────

  async saveGatewayToken(brandId: number, token: string, agentId?: string) {
    const existing = await this.prisma.laiguOrgConfig.findUnique({ where: { brandId } });
    if (existing) {
      await this.prisma.laiguOrgConfig.update({
        where: { brandId },
        data: { gatewayToken: token, agentId: agentId ?? existing.agentId, active: true },
      });
    } else {
      await this.prisma.laiguOrgConfig.create({
        data: { brandId, gatewayToken: token, agentId },
      });
    }
    return { ok: true, brand_id: brandId };
  }

  async gatewayStatus(brandId: number) {
    const cfg = await this.prisma.laiguOrgConfig.findUnique({ where: { brandId } });
    const [commentRows, lastComment] = await Promise.all([
      this.prisma.laiguComment.count({ where: { brandId } }),
      this.prisma.laiguComment.findFirst({
        where: { brandId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      brand_id: brandId,
      configured: Boolean(cfg?.gatewayToken),
      active: cfg?.active ?? false,
      last_sync_at: cfg?.lastSyncAt ?? null,
      last_comment_sync_at: cfg?.lastCommentSyncAt ?? null,
      comment_rows: commentRows,
      latest_comment_at: lastComment?.createdAt ?? null,
    };
  }

  private async gatewayConfig(brandId: number) {
    const cfg = await this.prisma.laiguOrgConfig.findUnique({ where: { brandId } });
    if (!cfg?.gatewayToken || !cfg.active) {
      throw new Error(`品牌 ${brandId} 尚无来鼓网关登录态，请先推送 token`);
    }
    return cfg;
  }

  private async gatewayCall(
    baseUrl: string,
    token: string,
    p: string,
    body: Record<string, unknown>,
  ): Promise<{ success?: boolean; message?: string; data?: any }> {
    const res = await fetch(`${baseUrl}${p}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: token,
        Origin: 'https://pro.laigu.com',
        Referer: 'https://pro.laigu.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
      },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => ({ success: false, message: `non-json ${res.status}` }));
  }

  /** 同步来鼓评论（专业号 KOS 评论流，按账号拆分） */
  async syncComments(brandIdParam?: number) {
    const brandId = brandIdParam ?? 6;
    const cfg = await this.gatewayConfig(brandId);
    const now = new Date();
    const windowEnd = now;
    const windowStart = cfg.lastCommentSyncAt
      ? new Date(cfg.lastCommentSyncAt.getTime() - SYNC_OVERLAP_SECONDS * 1000)
      : new Date(now.getTime() - 30 * 86400000);

    const size = 100;
    let curPage = 1;
    let upserted = 0;
    let empty = 0;
    for (;;) {
      const j = await this.gatewayCall(cfg.baseUrl, cfg.gatewayToken, '/spectrum/workbench/redbook/comment/list', {
        curPage,
        size,
        keyword: '',
        channelCorpIds: [],
        beginCreatedAt: windowStart.toISOString(),
        endCreatedAt: windowEnd.toISOString(),
        replyState: [],
      });
      if ((j as { success?: boolean })?.success !== true) {
        throw new Error(`来鼓评论拉取失败: ${JSON.stringify(j).slice(0, 200)}`);
      }
      const rows: any[] = j?.data?.data ?? [];
      if (!rows.length) {
        empty++;
        if (empty >= 2 || curPage > 60) break;
        curPage++;
        continue;
      }
      for (const r of rows) {
        if (!r?.commentId) continue;
        // 封面归一 https（http 会被浏览器混合内容策略拦截）
        let cover = typeof r.cover === 'string' ? r.cover.trim() : null;
        if (cover?.startsWith('http://')) cover = cover.replace(/^http:\/\//, 'https://');
        const data = {
          noteId: r.noteId ?? null,
          noteTitle: r.noteTitle ?? null,
          noteCover: cover || null,
          content: r.content ?? null,
          commentUserName: r.commentUserName ?? null,
          entOpenName: r.entOpenName ?? null,
          entOpenId: r.entOpenId ?? null,
          replyState: Number(r.replyState ?? 0),
          isLocalReply: r.isLocalReply ?? null,
          createdAt: r.createdAt ? new Date(r.createdAt) : null,
          rawJson: r as unknown as Prisma.InputJsonValue,
        };
        await this.prisma.laiguComment.upsert({
          where: { brandId_commentId: { brandId, commentId: String(r.commentId) } },
          create: { brandId, commentId: String(r.commentId), ...data },
          update: data,
        });
        upserted++;
      }
      const totalPage = Number(j?.data?.totalPage ?? 1);
      // 网关 totalPage 异常返回 totalNum，按 ceil(totalNum/size)+2 封顶
      const safePages = Math.min(
        Math.ceil(Number(j?.data?.totalNum ?? 0) / size) + 2,
        MAX_PAGES_PER_SYNC,
        totalPage || 1,
      );
      if (curPage >= safePages) break;
      curPage++;
    }

    await this.prisma.laiguOrgConfig.update({
      where: { brandId },
      data: { lastCommentSyncAt: now, lastSyncAt: now },
    });
    this.logger.log(`brand ${brandId} 来鼓评论同步完成：upsert ${upserted}`);
    return {
      ok: true,
      brand_id: brandId,
      upserted,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    };
  }

  /** 网关状态查询 */
  async gatewayCommentSample(brandId: number, take = 5) {
    return this.prisma.laiguComment.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        commentId: true,
        content: true,
        noteTitle: true,
        entOpenName: true,
        replyState: true,
        createdAt: true,
      },
    });
  }

  /** 从来鼓拉取会话并幂等入库；fromTm/toTm 缺省为「上次最新时间-重叠 → 现在」 */
  async syncLeads(opts?: { fromTm?: number; toTm?: number }) {
    if (this.syncing) throw new Error('同步进行中，请稍后再试');
    this.syncing = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const toTm = opts?.toTm ?? now;
      let fromTm = opts?.fromTm;
      if (!fromTm) {
        const latest = await this.prisma.laiguLead.findFirst({
          where: { brandId: LAIGU_BRAND_ID, lastMessageAt: { not: null } },
          orderBy: { lastMessageAt: 'desc' },
          select: { lastMessageAt: true },
        });
        const latestTs = latest?.lastMessageAt
          ? Math.floor(latest.lastMessageAt.getTime() / 1000)
          : 0;
        fromTm = Math.max(latestTs - SYNC_OVERLAP_SECONDS, toTm - MAX_WINDOW_SECONDS);
      }
      let fetched = 0;
      let pages = 0;
      let total = 0;
      for (let page = 1; page <= MAX_PAGES_PER_SYNC; page++) {
        const data = await this.api.chatMessages({
          from_tm: fromTm,
          to_tm: toTm,
          page,
          page_size: 100,
        });
        pages++;
        total = data.total ?? 0;
        for (const session of data.sessions ?? []) {
          await this.upsertSession(session);
        }
        fetched += (data.sessions ?? []).length;
        if (!data.sessions?.length || fetched >= total) break;
      }
      return { fetched, pages, total, from_tm: fromTm, to_tm: toTm };
    } finally {
      this.syncing = false;
    }
  }

  private extractPhone(session: LaiguSession): string | null {
    const tel = (session.client_attrs as { tel?: unknown } | undefined)?.tel;
    if (Array.isArray(tel) && tel.length && typeof tel[0] === 'string') return tel[0];
    if (typeof tel === 'string' && tel) return tel;
    return null;
  }

  /** 归属员工：取第一条非客户消息的发送者名（客服/KOS 账号昵称），供特斯拉 210 基线过滤 */
  private extractStaffName(session: LaiguSession): string | null {
    for (const m of session.messages ?? []) {
      if (m.role === 'client') continue;
      const name = (m.name ?? '').trim();
      if (name) return name.slice(0, 60);
    }
    return null;
  }

  /** Morgandada(5) 账号匹配集：KosAccount.authorUrl 提取小红书 userid + 客服昵称（缓存 5 分钟） */
  private async mddAccountSets(): Promise<{ userIds: Set<string>; nicknames: Set<string> }> {
    if (this.mddSetsCache && Date.now() - this.mddSetsCache.at < 5 * 60_000) {
      return this.mddSetsCache;
    }
    const accs = await this.prisma.kosAccount.findMany({
      where: { brandId: 5 },
      select: { nickname: true, authorUrl: true },
    });
    const userIds = new Set<string>();
    const nicknames = new Set<string>();
    for (const a of accs) {
      if (a.nickname) nicknames.add(a.nickname);
      const m = (a.authorUrl ?? '').match(/\/profile\/([0-9a-f]+)$/);
      if (m) userIds.add(m[1]);
    }
    this.mddSetsCache = { userIds, nicknames, at: Date.now() };
    return this.mddSetsCache;
  }

  /** Morgandada 归属判定（并集）：投放账户白名单 / 小红书账号 id / 客服昵称 */
  private async isMddSession(session: LaiguSession, staffName: string | null): Promise<boolean> {
    const advertiser = (session.ad_info as { advertiser_name?: string } | undefined)?.advertiser_name;
    if (advertiser && MDD_ADVERTISERS.includes(advertiser.trim())) return true;
    const sets = await this.mddAccountSets();
    if (session.sub_source && sets.userIds.has(session.sub_source)) return true;
    if (staffName && sets.nicknames.has(staffName)) return true;
    return false;
  }

  private async upsertSession(session: LaiguSession) {
    const messages = session.messages ?? [];
    const times = messages.map((m) => m.created_at).filter((t): t is number => typeof t === 'number');
    const clientMessages = messages.filter((m) => m.role === 'client');
    const lastClientText = [...clientMessages]
      .reverse()
      .find((m) => (m.type === 'text' || !m.type) && m.content)?.content;
    const staffName = this.extractStaffName(session);
    const advertiserName =
      (session.ad_info as { advertiser_name?: string } | undefined)?.advertiser_name ?? null;
    const isMdd = await this.isMddSession(session, staffName);
    const data: Prisma.LaiguLeadUncheckedCreateInput = {
      brandId: LAIGU_BRAND_ID,
      sessionId: String(session.session_id),
      clientId: session.client_id ?? null,
      clientName: session.client_name ?? null,
      phone: this.extractPhone(session),
      isResource: Boolean(session.is_resource),
      source: session.source ?? null,
      subSource: session.sub_source ?? null,
      chatEntry: session.chat_entry ?? null,
      ipLocation: session.ip_location ?? null,
      clientAttrs: (session.client_attrs ?? undefined) as Prisma.InputJsonValue | undefined,
      adInfo: (session.ad_info ?? undefined) as Prisma.InputJsonValue | undefined,
      messageCount: messages.length,
      clientMessageCount: clientMessages.length,
      firstMessageAt: times.length ? new Date(Math.min(...times) * 1000) : null,
      lastMessageAt: times.length ? new Date(Math.max(...times) * 1000) : null,
      lastClientContent: lastClientText ? lastClientText.slice(0, 500) : null,
      staffName,
      advertiserName,
      isMdd,
      sessionCreatedAt: session.created_at ? new Date(session.created_at * 1000) : null,
      sessionEndedAt: session.ended_at ? new Date(session.ended_at * 1000) : null,
      rawJson: session as unknown as Prisma.InputJsonValue,
    };
    return this.prisma.laiguLead.upsert({
      where: { sessionId: data.sessionId },
      create: data,
      update: {
        clientName: data.clientName,
        phone: data.phone ?? undefined,
        isResource: data.isResource,
        clientAttrs: data.clientAttrs,
        adInfo: data.adInfo,
        messageCount: data.messageCount,
        clientMessageCount: data.clientMessageCount,
        firstMessageAt: data.firstMessageAt,
        lastMessageAt: data.lastMessageAt,
        lastClientContent: data.lastClientContent,
        staffName: data.staffName ?? undefined,
        advertiserName: data.advertiserName ?? undefined,
        isMdd: data.isMdd,
        sessionCreatedAt: data.sessionCreatedAt,
        sessionEndedAt: data.sessionEndedAt,
        rawJson: data.rawJson,
      },
    });
  }

  async leads(query: {
    page?: string;
    page_size?: string;
    keyword?: string;
    isResource?: string;
    hasPhone?: string;
    source?: string;
    from?: string;
    to?: string;
    brandId?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 10) || 10);
    const brandId = Number(query.brandId ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const where: Prisma.LaiguLeadWhereInput = { brandId };
    // Morgandada(5)：仅显示本品牌会话（投放账户/账号id/客服昵称三判据，env LAIGU_MDD_FILTER=off 可关）
    if (brandId === 5 && process.env.LAIGU_MDD_FILTER !== 'off') where.isMdd = true;
    if (query.isResource === 'true') where.isResource = true;
    if (query.isResource === 'false') where.isResource = false;
    if (query.hasPhone === 'true') where.phone = { not: null };
    if (query.hasPhone === 'false') where.phone = null;
    if (query.source) where.source = query.source;
    if (query.from || query.to) {
      const activeAt: Prisma.DateTimeNullableFilter = {};
      if (query.from) activeAt.gte = new Date(`${query.from}T00:00:00`);
      if (query.to) activeAt.lte = new Date(`${query.to}T23:59:59`);
      where.lastMessageAt = activeAt;
    }
    if (query.keyword) {
      where.OR = [
        { clientName: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword } },
        { lastClientContent: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.laiguLead.count({ where }),
      this.prisma.laiguLead.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sessionId: true,
          clientName: true,
          phone: true,
          isResource: true,
          source: true,
          subSource: true,
          adInfo: true,
          messageCount: true,
          clientMessageCount: true,
          firstMessageAt: true,
          lastMessageAt: true,
          lastClientContent: true,
          sessionCreatedAt: true,
          sessionEndedAt: true,
          fetchedAt: true,
        },
      }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        session_id: row.sessionId,
        client_name: row.clientName,
        phone: row.phone,
        is_resource: row.isResource,
        source: row.source,
        sub_source: row.subSource,
        ad_info: row.adInfo,
        message_count: row.messageCount,
        client_message_count: row.clientMessageCount,
        first_message_at: row.firstMessageAt,
        last_message_at: row.lastMessageAt,
        last_client_content: row.lastClientContent,
        session_created_at: row.sessionCreatedAt,
        session_ended_at: row.sessionEndedAt,
        fetched_at: row.fetchedAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async stats(brandIdParam?: string) {
    const brandId = Number(brandIdParam ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const scope: Prisma.LaiguLeadWhereInput = { brandId };
    if (brandId === 5 && process.env.LAIGU_MDD_FILTER !== 'off') scope.isMdd = true;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [total, resourced, withPhone, today] = await Promise.all([
      this.prisma.laiguLead.count({ where: scope }),
      this.prisma.laiguLead.count({ where: { ...scope, isResource: true } }),
      this.prisma.laiguLead.count({ where: { ...scope, phone: { not: null } } }),
      this.prisma.laiguLead.count({
        where: { ...scope, lastMessageAt: { gte: dayStart } },
      }),
    ]);
    return { total, resourced, with_phone: withPhone, today };
  }

  /** 用户反馈分析聚合（特斯拉面板）：会话级评论分类/情感/高频话题，规则引擎无外部依赖 */
  async feedbackAnalysis(query: { brandId?: string; days?: string }) {
    const brandId = Number(query.brandId ?? LAIGU_BRAND_ID) || LAIGU_BRAND_ID;
    const days = Math.min(90, Math.max(1, Number(query.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400000);

    // 特斯拉（brand6）：来鼓坐席为组名（非个人账号），按组名含「特斯拉」过滤，
    // 剔除「上汽大众区域号（全天）」「超级管理员」等其他品牌/管理坐席的会话；
    // 会话表为单网关存储（brandId 固定为 LAIGU_BRAND_ID=5），brand6 查询不按 brandId 过滤
    // Morgandada（brand5）：只显示 isMdd 会话（投放账户/账号id/客服昵称三判据并集）
    const sessionWhere: Prisma.LaiguLeadWhereInput = {
      ...(brandId === 6 ? {} : { brandId }),
      OR: [{ lastMessageAt: { gte: since } }, { sessionCreatedAt: { gte: since } }],
    };
    if (brandId === 5 && process.env.LAIGU_MDD_FILTER !== 'off') sessionWhere.isMdd = true;
    if (brandId === 6) sessionWhere.staffName = { contains: '特斯拉' };

    // 来鼓评论口径（专业号 KOS 评论流）：会话为空但有评论时启用
    const leadCount = await this.prisma.laiguLead.count({ where: sessionWhere });
    const commentCount = await this.prisma.laiguComment.count({ where: { brandId } });
    if (leadCount === 0 && commentCount > 0) {
      return this.commentFeedback(brandId, days, since);
    }

    const rows = await this.prisma.laiguLead.findMany({
      where: sessionWhere,
      select: {
        id: true,
        clientName: true,
        lastClientContent: true,
        isResource: true,
        phone: true,
        messageCount: true,
        clientMessageCount: true,
        staffName: true,
        lastMessageAt: true,
        sessionCreatedAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 5000,
    });

    const PRICE_WORDS = ['价格', '多少钱', '少钱', '落地', '优惠', '便宜', '报价', '贷款', '分期', '几万', '预算', '定金', '订金'];
    const PRODUCT_WORDS = ['续航', '空间', '配置', '充电', '电耗', '油耗', '对比', '性能', '马力', '尺寸', '后备箱', '内饰', '试驾', '保险', '提车', '交付', '版本', '选装'];
    const INTENT_WORDS = ['展车', '到店', '预约', '下定', '订车', '想买', '想要', '打算', '考虑', '购买', '发我', '私我', '私信', '发一下', '求链接', '滴滴', '联系方式', '什么时候有', '哪里有', '哪里买', '多久有', '蹲一个', '怎么买', '还有货'];
    const NEG_WORDS = ['问题', '投诉', '差评', '失望', '故障', '异响', '维权', '吐槽', '后悔', '坑', '垃圾', '修不好', '扯皮'];
    const POS_WORDS = ['好看', '漂亮', '喜欢', '点赞', '不错', '支持', '厉害', '羡慕', '真香', '满意', '舒服', '推荐', '称赞'];

    const classify = (text: string): { category: string; sentiment: '正面' | '中性' | '负面' } => {
      const s = text ?? '';
      const has = (list: string[]) => list.some((w) => s.includes(w));
      if (has(NEG_WORDS)) return { category: '负面评价', sentiment: '负面' };
      if (has(POS_WORDS)) return { category: '正面评价', sentiment: '正面' };
      if (has(PRICE_WORDS)) return { category: '价格咨询', sentiment: '中性' };
      if (has(PRODUCT_WORDS)) return { category: '产品咨询', sentiment: '中性' };
      if (has(INTENT_WORDS)) return { category: '意向回复', sentiment: '中性' };
      return { category: '闲聊互动', sentiment: '中性' };
    };

    const catCount = new Map<string, number>();
    const sentiCount = new Map<string, number>();
    let leads = 0;
    let withPhone = 0;
    let replied = 0;
    const detail: {
      id: number;
      author: string;
      content: string;
      category: string;
      sentiment: string;
      isLead: boolean;
      replied: boolean;
      time: string;
    }[] = [];
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let today = 0;
    const contents: string[] = [];
    for (const r of rows) {
      const text = r.lastClientContent ?? '';
      const { category, sentiment } = classify(text);
      catCount.set(category, (catCount.get(category) ?? 0) + 1);
      sentiCount.set(sentiment, (sentiCount.get(sentiment) ?? 0) + 1);
      if (r.isResource) leads += 1;
      if (r.phone) withPhone += 1;
      const repliedRow = r.messageCount - r.clientMessageCount > 0;
      if (repliedRow) replied += 1;
      const lastAt = r.lastMessageAt ?? r.sessionCreatedAt;
      if (lastAt && lastAt >= dayStart) today += 1;
      if (text) contents.push(text);
      if (detail.length < 500) {
        detail.push({
          id: r.id,
          author: r.clientName ?? '匿名用户',
          content: text || '（无文字内容）',
          category,
          sentiment,
          isLead: !!r.isResource,
          replied: repliedRow,
          time: (r.lastMessageAt ?? r.sessionCreatedAt ?? new Date()).toISOString(),
        });
      }
    }
    const total = rows.length;
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return {
      days,
      total,
      today,
      leads,
      with_phone: withPhone,
      replied,
      pending: total - replied,
      reply_rate: pct(replied),
      sentiment: (['正面', '中性', '负面'] as const).map((name) => ({
        name,
        count: sentiCount.get(name) ?? 0,
        pct: pct(sentiCount.get(name) ?? 0),
      })),
      categories: [...catCount.entries()]
        .map(([name, count]) => ({ name, count, pct: pct(count) }))
        .sort((a, b) => b.count - a.count),
      comments: detail,
      topics: extractKeywords(contents, 30),
      scope_note:
        brandId === 6
          ? '数据源=来鼓私信会话（用户最后一条消息），仅统计特斯拉坐席组（剔除上汽大众等其他品牌坐席）；分类/情感为关键词规则引擎判定'
          : brandId === 5
            ? '数据源=来鼓私信会话（用户最后一条消息），仅显示 Morgandada 投放账户/门店账号的会话；分类/情感为关键词规则引擎判定'
            : '数据源=来鼓私信会话（用户最后一条消息），非小红书笔记评论；分类/情感为关键词规则引擎判定',
    };
  }

  /** 评论口径的用户反馈分析（与私信口径同形返回） */
  private async commentFeedback(brandId: number, days: number, since: Date) {
    const rows = await this.prisma.laiguComment.findMany({
      where: { brandId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const PRICE_WORDS = ['价格', '多少钱', '少钱', '落地', '优惠', '便宜', '报价', '贷款', '分期', '几万', '预算', '定金', '订金', '万提', 'w提', '裸车'];
    const PRODUCT_WORDS = ['续航', '空间', '配置', '充电', '电耗', '对比', '性能', '马力', '尺寸', '后备箱', '内饰', '试驾', '保险', '提车', '交付', '版本', '选装', '智驾', '辅助驾驶'];
    const INTENT_WORDS = ['展车', '到店', '预约', '下定', '订车', '想买', '想要', '打算', '考虑', '购买', '发我', '私我', '私信', '发一下', '求链接', '滴滴', '联系方式', '什么时候有', '哪里有', '哪里买', '多久有', '蹲一个', '怎么买', '还有货'];
    const NEG_WORDS = ['问题', '投诉', '差评', '失望', '故障', '异响', '维权', '吐槽', '后悔', '坑', '垃圾', '修不好', '扯皮', '损伤'];
    const POS_WORDS = ['好看', '漂亮', '喜欢', '点赞', '不错', '支持', '厉害', '羡慕', '真香', '满意', '舒服', '推荐', '称赞', '太帅', '封神', '胜利'];

    const classify = (text: string): { category: string; sentiment: '正面' | '中性' | '负面' } => {
      const s = text ?? '';
      const has = (list: string[]) => list.some((w) => s.includes(w));
      if (has(NEG_WORDS)) return { category: '负面评价', sentiment: '负面' };
      if (has(POS_WORDS)) return { category: '正面评价', sentiment: '正面' };
      if (has(PRICE_WORDS)) return { category: '价格咨询', sentiment: '中性' };
      if (has(PRODUCT_WORDS)) return { category: '产品咨询', sentiment: '中性' };
      if (has(INTENT_WORDS)) return { category: '意向回复', sentiment: '中性' };
      return { category: '闲聊互动', sentiment: '中性' };
    };

    const catCount = new Map<string, number>();
    const sentiCount = new Map<string, number>();
    let replied = 0;
    const detail: {
      id: number;
      author: string;
      content: string;
      category: string;
      sentiment: string;
      isLead: boolean;
      replied: boolean;
      time: string;
      note_title: string | null;
      note_cover: string | null;
      note_url: string | null;
      kos_account: string | null;
    }[] = [];
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let today = 0;
    const contents: string[] = [];
    for (const r of rows) {
      const text = r.content ?? '';
      const { category, sentiment } = classify(text);
      catCount.set(category, (catCount.get(category) ?? 0) + 1);
      sentiCount.set(sentiment, (sentiCount.get(sentiment) ?? 0) + 1);
      const repliedRow = (r.replyState ?? 0) === 1;
      if (repliedRow) replied += 1;
      if (r.createdAt && r.createdAt >= dayStart) today += 1;
      if (text) contents.push(text);
      if (detail.length < 500) {
        detail.push({
          id: r.id,
          author: r.commentUserName ?? '匿名用户',
          content: text || '（无文字内容）',
          category,
          sentiment,
          isLead: false,
          replied: repliedRow,
          time: (r.createdAt ?? new Date()).toISOString(),
          note_title: r.noteTitle,
          note_cover: r.noteCover,
          note_url: null,
          kos_account: r.entOpenName,
        });
      }
    }
    // 评论 → 具体笔记：按 noteId 匹配 KoxNote（noteUrl 带 xsec_token 可直接打开）
    const detailNoteIds = [
      ...new Set(
        rows
          .slice(0, detail.length)
          .map((r) => r.noteId)
          .filter((n): n is string => !!n),
      ),
    ];
    if (detailNoteIds.length) {
      const noteRows = await this.prisma.koxNote.findMany({
        where: { brandId, noteId: { in: detailNoteIds } },
        select: { noteId: true, noteUrl: true, coverUrl: true, title: true },
      });
      const noteByUrl = new Map(noteRows.map((n) => [n.noteId, n]));
      for (let i = 0; i < detail.length; i++) {
        const r = rows[i];
        if (!r?.noteId) continue;
        const n = noteByUrl.get(r.noteId);
        if (n) {
          detail[i].note_url = n.noteUrl;
          if (!detail[i].note_cover) detail[i].note_cover = n.coverUrl;
          if (!detail[i].note_title) detail[i].note_title = n.title;
        }
      }
    }
    const total = rows.length;
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return {
      days,
      total,
      today,
      leads: 0,
      with_phone: 0,
      replied,
      pending: total - replied,
      reply_rate: pct(replied),
      sentiment: (['正面', '中性', '负面'] as const).map((name) => ({
        name,
        count: sentiCount.get(name) ?? 0,
        pct: pct(sentiCount.get(name) ?? 0),
      })),
      categories: [...catCount.entries()]
        .map(([name, count]) => ({ name, count, pct: pct(count) }))
        .sort((a, b) => b.count - a.count),
      comments: detail,
      detail_total: detail.length,
      topics: extractKeywords(contents, 30),
      source: 'laigu_comments',
      scope_note:
        '数据源=来鼓评论管理（专业号 KOS 笔记的用户评论）；统计为所选周期全量，明细展示最近 500 条；分类/情感为关键词规则引擎判定',
    };
  }

  async leadDetail(id: number) {
    const lead = await this.prisma.laiguLead.findUnique({ where: { id } });
    if (!lead) return null;
    return {
      id: lead.id,
      session_id: lead.sessionId,
      client_id: lead.clientId,
      client_name: lead.clientName,
      phone: lead.phone,
      is_resource: lead.isResource,
      source: lead.source,
      sub_source: lead.subSource,
      chat_entry: lead.chatEntry,
      ip_location: lead.ipLocation,
      client_attrs: lead.clientAttrs,
      ad_info: lead.adInfo,
      message_count: lead.messageCount,
      client_message_count: lead.clientMessageCount,
      first_message_at: lead.firstMessageAt,
      last_message_at: lead.lastMessageAt,
      session_created_at: lead.sessionCreatedAt,
      session_ended_at: lead.sessionEndedAt,
      fetched_at: lead.fetchedAt,
      raw_json: lead.rawJson,
    };
  }
}
