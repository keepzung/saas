// 灵感引擎主编排：内容池读写、关键词/竞品管理、抓取执行与调度
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStore } from './scraper/session.store';
import { DESKTOP_UA, launchBrowser, newAuthedContext, sleep } from './scraper/browser.util';
import { PlatformBlockedError, ScrapedItem, SessionMissingError, parseCount, stripHtml } from './scraper/types';
import { uploadRoot } from './media.util';
import { scrapeXhsHot, scrapeXhsSearch } from './scraper/xhs.scraper';
import { scrapeBiliAuthor, scrapeBiliHot, scrapeBiliSearch } from './scraper/bilibili.scraper';

const KEYWORD_INTERVAL_HOURS = Number(process.env.HOTSPOT_KEYWORD_INTERVAL_HOURS ?? 6);
const COMPETITOR_INTERVAL_HOURS = Number(process.env.HOTSPOT_COMPETITOR_INTERVAL_HOURS ?? 24);
const ROUND_MAX_TASKS = Number(process.env.HOTSPOT_ROUND_MAX_TASKS ?? 12);
const ROUND_MAX_COMPETITORS = Number(process.env.HOTSPOT_ROUND_MAX_COMPETITORS ?? 5);
const ROUND_INTERVAL_MINUTES = Number(process.env.HOTSPOT_SCRAPE_INTERVAL_MINUTES ?? 30);

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);
  private roundRunning = false;
  private lastRoundAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private sessions: SessionStore,
  ) {}

  // ─── 内容池查询 ─────────────────────────────────────────────────────
  async contents(q: {
    brandId: number;
    platform?: string;
    sourceType?: string;
    keyword?: string;
    breakdown?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, q.pageSize ?? 24));
    const where = {
      OR: [{ isPublic: true }, { brandId: q.brandId }],
      ...(q.platform ? { platform: q.platform } : {}),
      ...(q.sourceType ? { sourceType: q.sourceType } : {}),
      ...(q.keyword ? { title: { contains: q.keyword } } : {}),
      ...(q.breakdown === 'done' ? { breakdownStatus: 'done' } : {}),
      ...(q.breakdown === 'none' ? { breakdownStatus: 'none' } : {}),
    };
    const orderBy =
      q.sort === 'hot'
        ? [{ likeCount: 'desc' as const }, { scrapedAt: 'desc' as const }]
        : q.sort === 'views'
          ? [{ viewCount: 'desc' as const }, { scrapedAt: 'desc' as const }]
          : [{ firstSeenAt: 'desc' as const }];
    const [rows, total] = await Promise.all([
      this.prisma.hotContent.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { breakdown: { select: { id: true, status: true, partial: true, styleTags: true } } },
      }),
      this.prisma.hotContent.count({ where }),
    ]);
    return {
      total,
      page,
      page_size: pageSize,
      items: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        content_id: r.contentId,
        kind: r.kind,
        title: r.title,
        cover_url: r.coverUrl,
        author_id: r.authorId,
        author_name: r.authorName,
        author_fans: r.authorFans,
        topics: r.topics,
        publish_time: r.publishTime,
        view_count: r.viewCount,
        like_count: r.likeCount,
        comment_count: r.commentCount,
        share_count: r.shareCount,
        collect_count: r.collectCount,
        source_type: r.sourceType,
        source_keyword: r.sourceKeyword,
        brand_id: r.brandId,
        breakdown_status: r.breakdownStatus,
        breakdown: r.breakdown
          ? { id: r.breakdown.id, status: r.breakdown.status, partial: r.breakdown.partial, style_tags: r.breakdown.styleTags }
          : null,
        first_seen_at: r.firstSeenAt,
        scraped_at: r.scrapedAt,
      })),
    };
  }

  async contentDetail(brandId: number, id: number) {
    const row = await this.prisma.hotContent.findFirst({
      where: { id, OR: [{ isPublic: true }, { brandId }] },
      include: { breakdown: true },
    });
    if (!row) throw new NotFoundException('内容不存在');
    return { ...row, breakdown: row.breakdown };
  }

  // ─── 关键词管理 ─────────────────────────────────────────────────────
  keywords(brandId: number) {
    return this.prisma.hotspotKeyword
      .findMany({ where: { brandId }, orderBy: [{ enabled: 'desc' }, { id: 'asc' }] })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          keyword: r.keyword,
          platforms: r.platforms,
          enabled: r.enabled,
          last_scraped_at: r.lastScrapedAt,
        })),
      );
  }

  async addKeyword(brandId: number, keyword: string, platforms?: string[]) {
    keyword = keyword.trim().slice(0, 60);
    if (!keyword) throw new BadRequestException('关键词不能为空');
    const exists = await this.prisma.hotspotKeyword.findUnique({
      where: { brandId_keyword: { brandId, keyword } },
    });
    if (exists) throw new BadRequestException('该关键词已存在');
    return this.prisma.hotspotKeyword.create({
      data: { brandId, keyword, platforms: platforms?.length ? platforms : ['xhs', 'bilibili'] },
    });
  }

  async updateKeyword(brandId: number, id: number, data: { enabled?: boolean; platforms?: string[] }) {
    const row = await this.prisma.hotspotKeyword.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('关键词不存在');
    return this.prisma.hotspotKeyword.update({
      where: { id },
      data: {
        ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
        ...(data.platforms ? { platforms: data.platforms } : {}),
      },
    });
  }

  async deleteKeyword(brandId: number, id: number) {
    const row = await this.prisma.hotspotKeyword.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('关键词不存在');
    await this.prisma.hotspotKeyword.delete({ where: { id } });
    return { id };
  }

  // ─── 竞品管理 ───────────────────────────────────────────────────────
  competitors(brandId: number) {
    return this.prisma.competitorAccount
      .findMany({ where: { brandId }, orderBy: { id: 'asc' } })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          platform: r.platform,
          author_id: r.authorId,
          nickname: r.nickname,
          avatar: r.avatar,
          home_url: r.homeUrl,
          alias: r.alias,
          note: r.note,
          enabled: r.enabled,
          last_sync_at: r.lastSyncAt,
        })),
      );
  }

  /** 粘贴主页链接解析竞品账号（xhs /user/profile/<uid>；bili space.bilibili.com/<mid>） */
  async parseCompetitor(brandId: number, platform: string, url: string, alias?: string, note?: string) {
    const m =
      platform === 'xhs'
        ? url.match(/user\/profile\/([0-9a-zA-Z]+)/)
        : url.match(/space\.bilibili\.com\/(\d+)/);
    if (!m) throw new BadRequestException('无法从链接解析账号 ID：小红书请粘贴形如 /user/profile/xxx 的主页链接，B站请粘贴 space.bilibili.com/<mid>');

    const authorId = m[1];
    const exists = await this.prisma.competitorAccount.findUnique({
      where: { brandId_platform_authorId: { brandId, platform, authorId } },
    });
    if (exists) throw new BadRequestException('该竞品账号已在跟踪列表中');

    const browser = await launchBrowser();
    let nickname = '';
    let avatar: string | null = null;
    let fans: number | null = null;
    try {
      const ctx = await newAuthedContext(browser, await this.sessions.getState(platform));
      const page = await ctx.newPage();
      if (platform === 'xhs') {
        const info = (await page
          .goto(`https://www.xiaohongshu.com/user/profile/${authorId}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          .then(() =>
            page.evaluate(async () => {
              const res = await fetch(`${location.origin}/api/sns/web/v1/user/otherinfo`, { credentials: 'include' });
              return res.json();
            }),
          )
          .catch(() => null)) as { code?: number; data?: { nickname?: string; imageb?: string; fans?: string; notes?: string } } | null;
        if (info?.code !== 0 || !info?.data) throw new BadRequestException('解析失败：会话可能过期或账号不存在');
        nickname = info.data.nickname ?? '';
        avatar = info.data.imageb ?? null;
        fans = parseCount(info.data.fans);
      } else {
        const info = (await page
          .goto('https://www.bilibili.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
          .then(() =>
            page.evaluate(async (mid) => {
              const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=false`, {
                credentials: 'include',
              });
              return res.json();
            }, authorId),
          )
          .catch(() => null)) as { code?: number; data?: { card?: { name?: string; face?: string; fans?: string } } } | null;
        if (info?.code !== 0 || !info?.data?.card) throw new BadRequestException('解析失败：B站账号不存在');
        nickname = info.data.card.name ?? '';
        avatar = info.data.card.face ?? null;
        fans = parseCount(info.data.card.fans);
      }
      await ctx.close();
    } finally {
      await browser.close();
    }

    const row = await this.prisma.competitorAccount.create({
      data: { brandId, platform, authorId, nickname, avatar, homeUrl: url, alias, note, lastSyncAt: new Date() },
    });
    // 异步补一轮该竞品内容
    void this.syncCompetitor(row.id, brandId).catch((e) =>
      this.logger.warn(`竞品 ${row.nickname || authorId} 首次同步失败: ${e?.message ?? e}`),
    );
    return { id: row.id, nickname, fans };
  }

  async deleteCompetitor(brandId: number, id: number) {
    const row = await this.prisma.competitorAccount.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('竞品账号不存在');
    await this.prisma.competitorAccount.delete({ where: { id } });
    return { id };
  }

  async toggleCompetitor(brandId: number, id: number, enabled: boolean) {
    const row = await this.prisma.competitorAccount.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('竞品账号不存在');
    return this.prisma.competitorAccount.update({ where: { id }, data: { enabled } });
  }

  /** 本机抓取结果导入（与 scrapeNow 的 upsert 同管道；items 已是 ScrapedItem 形状） */
  async importContents(input: { brandId: number; sourceType: string; sourceKeyword?: string; items: ScrapedItem[] }) {
    const r = await this.upsertContents(input.items, {
      brandId: input.brandId,
      sourceType: input.sourceType,
      sourceKeyword: input.sourceKeyword,
      isPublic: input.sourceType !== 'competitor',
    });
    this.logger.log(`导入抓取结果 brand=${input.brandId} ${input.sourceType}/${input.sourceKeyword ?? ''}: 新增 ${r.inserted}，更新 ${r.updated}`);
    return r;
  }

  // ─── 内容池 upsert（含达人自动入池）──────────────────────────────────
  async upsertContents(
    items: ScrapedItem[],
    opts: { brandId: number; sourceType: string; sourceKeyword?: string; isPublic?: boolean },
  ) {
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      if (!it.contentId) continue;
      const data = {
        platform: it.platform,
        contentId: it.contentId,
        kind: it.kind,
        title: it.title ?? '',
        content: it.content ?? null,
        coverUrl: it.coverUrl ?? null,
        videoUrl: it.videoUrl ?? null,
        durationSec: it.durationSec ?? null,
        authorId: it.authorId ?? '',
        authorName: it.authorName ?? '',
        authorAvatar: it.authorAvatar ?? null,
        authorFans: it.authorFans ?? null,
        topics: it.topics ?? [],
        publishTime: it.publishTime ?? null,
        viewCount: it.viewCount ?? 0,
        likeCount: it.likeCount ?? 0,
        commentCount: it.commentCount ?? 0,
        shareCount: it.shareCount ?? 0,
        collectCount: it.collectCount ?? 0,
        sourceType: opts.sourceType,
        sourceKeyword: opts.sourceKeyword ?? null,
        brandId: opts.brandId,
        isPublic: opts.isPublic ?? true,
        rawJson: it.raw ? (JSON.parse(JSON.stringify(it.raw)) as Prisma.InputJsonObject) : undefined,
      };
      const r = await this.prisma.hotContent.upsert({
        where: { platform_contentId: { platform: it.platform, contentId: it.contentId } },
        create: data,
        update: {
          likeCount: data.likeCount,
          viewCount: data.viewCount,
          commentCount: data.commentCount,
          shareCount: data.shareCount,
          collectCount: data.collectCount,
          authorFans: data.authorFans,
          // 小红书封面直链带时效签名会过期，重复抓到同一内容时用新直链刷新
          ...(data.coverUrl ? { coverUrl: data.coverUrl } : {}),
          rawJson: data.rawJson,
        },
      });
      if (r.firstSeenAt.getTime() === r.scrapedAt.getTime()) inserted += 1;
      else updated += 1;
      if (it.authorId && it.authorName) await this.upsertCreator(it);
    }
    // 封面本地化（后台执行，不阻塞入库）：平台 CDN 直链数小时即失效
    void this.localizeCovers(items).catch((e) => this.logger.warn(`封面本地化异常: ${(e as Error).message?.split('\n')[0]}`));
    return { inserted, updated };
  }

  /** 封面本地化：下载到 /uploads/hotspot/covers 并改写 coverUrl；失败保留原直链（下次抓取重试） */
  private async localizeCovers(items: ScrapedItem[]) {
    for (const it of items) {
      if (!it.coverUrl || !it.contentId || !/^https?:\/\//.test(it.coverUrl)) continue;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(it.coverUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': DESKTOP_UA,
            Referer: it.platform === 'bilibili' ? 'https://www.bilibili.com/' : 'https://www.xiaohongshu.com/',
          },
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1024) continue;
        const ext = (it.coverUrl.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg').toLowerCase();
        const dir = path.join(uploadRoot(), 'hotspot', 'covers');
        fs.mkdirSync(dir, { recursive: true });
        const name = `${it.platform}_${it.contentId}.${ext}`;
        fs.writeFileSync(path.join(dir, name), buf);
        await this.prisma.hotContent.update({
          where: { platform_contentId: { platform: it.platform, contentId: it.contentId } },
          data: { coverUrl: `/uploads/hotspot/covers/${name}` },
        });
      } catch {
        /* 单张失败忽略，保留原直链 */
      }
    }
  }

  /** 热点作者自动入池 KolCreator（跨平台达人库，hotHits 累计） */
  private async upsertCreator(it: ScrapedItem) {
    const sys = await this.systemUserId();
    if (!sys) return;
    const base = {
      nickname: it.authorName ?? '',
      avatar: it.authorAvatar ?? null,
      fans: it.authorFans ?? 0,
      homePage:
        it.platform === 'xhs' && it.authorId
          ? `https://www.xiaohongshu.com/user/profile/${it.authorId}`
          : it.platform === 'bilibili' && it.authorId
            ? `https://space.bilibili.com/${it.authorId}`
            : null,
    };
    try {
      const existing = await this.prisma.kolCreator.findUnique({
        where: { platform_authorId: { platform: it.platform, authorId: it.authorId! } },
        select: { id: true, hotHits: true, fans: true },
      });
      if (existing) {
        await this.prisma.kolCreator.update({
          where: { id: existing.id },
          data: { ...base, fans: Math.max(existing.fans, base.fans ?? 0), hotHits: { increment: 1 } },
        });
      } else {
        await this.prisma.kolCreator.create({
          data: { platform: it.platform, authorId: it.authorId!, ...base, createdById: sys },
        });
      }
    } catch (e) {
      this.logger.warn(`达人入池失败 ${it.platform}/${it.authorId}: ${(e as Error).message?.split('\n')[0]}`);
    }
  }

  private sysUserIdCache: number | null | undefined;
  private async systemUserId(): Promise<number | null> {
    if (this.sysUserIdCache !== undefined) return this.sysUserIdCache;
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' }, select: { id: true } });
    const any = admin ?? (await this.prisma.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }));
    this.sysUserIdCache = any?.id ?? null;
    return this.sysUserIdCache;
  }

  // ─── 抓取执行 ───────────────────────────────────────────────────────
  /** 单关键词单平台立即抓取（手动触发按钮） */
  async scrapeNow(brandId: number, platform: string, keyword: string) {
    const items = await this.withPlatformSession(platform, async (page) => {
      await sleep(1500 + Math.floor(Math.random() * 1500));
      return platform === 'xhs' ? scrapeXhsSearch(page, keyword) : scrapeBiliSearch(page, keyword);
    });
    const r = await this.upsertContents(items, { brandId, sourceType: 'search', sourceKeyword: keyword, isPublic: true });
    this.logger.log(`手动抓取 ${platform}/${keyword}: 新增 ${r.inserted}，更新 ${r.updated}`);
    return { ...r, scraped: items.length };
  }

  /** 竞品内容同步（手动/调度） */
  async syncCompetitor(competitorId: number, brandId: number) {
    const row = await this.prisma.competitorAccount.findFirst({ where: { id: competitorId, brandId } });
    if (!row) throw new NotFoundException('竞品账号不存在');
    const items = await this.withPlatformSession(row.platform, async (page) => {
      if (row.platform === 'xhs') {
        return this.scrapeXhsAuthorPosted(page, row.authorId, row.nickname);
      }
      return scrapeBiliAuthor(page, row.authorId);
    });
    const r = await this.upsertContents(items, {
      brandId,
      sourceType: 'competitor',
      sourceKeyword: row.alias ?? row.nickname,
      isPublic: false,
    });
    await this.prisma.competitorAccount.update({ where: { id: row.id }, data: { lastSyncAt: new Date() } });
    this.logger.log(`竞品同步 ${row.nickname || row.authorId}: 新增 ${r.inserted}，更新 ${r.updated}`);
    return r;
  }

  /** 小红书作者主页笔记列表（拦截 user_posted，v2 模式） */
  private async scrapeXhsAuthorPosted(page: import('playwright-core').Page, authorId: string, fallbackName: string): Promise<ScrapedItem[]> {
    const items: Array<{
      note_id?: string;
      xsec_token?: string;
      display_title?: string;
      type?: string;
      cover?: { url?: string; url_default?: string; info_list?: { url?: string }[] };
      interact_info?: { liked_count?: string };
    }> = [];
    const onResponse = (res: import('playwright-core').Response) => {
      if (!res.url().includes('/api/sns/web/v1/user_posted')) return;
      res
        .json()
        .then((j: { code?: number; data?: { notes?: typeof items } }) => {
          const notes = j?.data?.notes;
          if (Array.isArray(notes)) items.push(...notes);
        })
        .catch(() => {});
    };
    page.on('response', onResponse);
    try {
      await page.goto(`https://www.xiaohongshu.com/user/profile/${authorId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(4000);
    } finally {
      page.removeListener('response', onResponse);
    }
    const normalize = (u?: string | null) => {
      if (!u) return null;
      let s = String(u);
      if (s.startsWith('//')) s = `https:${s}`;
      return s.startsWith('https://') ? s : null;
    };
    return items
      .filter((n) => n.note_id)
      .map((n) => ({
        platform: 'xhs',
        contentId: n.note_id!,
        kind: n.type === 'video' ? ('video' as const) : ('note' as const),
        title: stripHtml(n.display_title).slice(0, 200),
        coverUrl: normalize(n.cover?.url ?? n.cover?.url_default ?? n.cover?.info_list?.at(-1)?.url),
        authorId,
        authorName: fallbackName,
        likeCount: parseCount(n.interact_info?.liked_count),
        raw: { xsec_token: n.xsec_token ?? null, keyword: `竞品:${fallbackName}` },
      }));
  }

  /** 统一包裹：会话加载 → 浏览器 → 回调 → 状态回写（拆解取详情时复用） */
  async withPlatformSession<T>(platform: string, fn: (page: import('playwright-core').Page) => Promise<T>): Promise<T> {
    const state = await this.sessions.getState(platform);
    const browser = await launchBrowser();
    try {
      const ctx = await newAuthedContext(browser, state);
      const page = await ctx.newPage();
      try {
        const r = await fn(page);
        await this.sessions.markOk(platform);
        return r;
      } catch (e) {
        if (e instanceof PlatformBlockedError) {
          const msg = e.message;
          if (msg.includes('登录')) await this.sessions.mark(platform, 'manual_required', msg);
          else await this.sessions.mark(platform, 'active', msg); // 风控≠会话失效，保持状态
        }
        throw e;
      } finally {
        await ctx.close().catch(() => {});
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── 调度轮 ─────────────────────────────────────────────────────────
  roundStatus() {
    return { running: this.roundRunning, last_round_at: this.lastRoundAt };
  }

  /** 一轮定时抓取：到期关键词 × 平台 + 到期竞品；单平台会话失效则跳过该平台本轮 */
  async runScrapeRound(): Promise<{
    tasks: number;
    inserted: number;
    updated: number;
    skipped_platforms: string[];
    competitors: number;
  }> {
    if (this.roundRunning) return { tasks: 0, inserted: 0, updated: 0, skipped_platforms: [], competitors: 0 };
    this.roundRunning = true;
    const summary = { tasks: 0, inserted: 0, updated: 0, skipped: new Set<string>(), competitors: 0 };
    try {
      const dueBefore = new Date(Date.now() - KEYWORD_INTERVAL_HOURS * 3600 * 1000);
      const keywords = await this.prisma.hotspotKeyword.findMany({
        where: { enabled: true, OR: [{ lastScrapedAt: null }, { lastScrapedAt: { lt: dueBefore } }] },
        orderBy: { lastScrapedAt: 'asc' },
        take: ROUND_MAX_TASKS,
      });

      for (const kw of keywords) {
        for (const platform of kw.platforms) {
          if (summary.skipped.has(platform)) continue;
          if (summary.tasks >= ROUND_MAX_TASKS) break;
          try {
            const r = await this.scrapeNow(kw.brandId, platform, kw.keyword);
            summary.tasks += 1;
            summary.inserted += r.inserted;
            summary.updated += r.updated;
            await this.prisma.hotspotKeyword.update({ where: { id: kw.id }, data: { lastScrapedAt: new Date() } });
          } catch (e) {
            if (e instanceof SessionMissingError) {
              summary.skipped.add(platform);
              this.logger.warn(`调度轮跳过平台 ${platform}（会话不可用）`);
            } else if (e instanceof PlatformBlockedError) {
              summary.skipped.add(platform);
              this.logger.warn(`调度轮跳过平台 ${platform}（风控）：${e.message}`);
            } else {
              this.logger.warn(`关键词抓取失败 ${kw.keyword}/${platform}: ${(e as Error).message?.split('\n')[0]}`);
            }
            await sleep(8000);
          }
          await sleep(2000 + Math.floor(Math.random() * 2000));
        }
        if (summary.tasks >= ROUND_MAX_TASKS) break;
      }

      // 竞品同步（每 COMPETITOR_INTERVAL_HOURS 一轮）
      const compDueBefore = new Date(Date.now() - COMPETITOR_INTERVAL_HOURS * 3600 * 1000);
      const comps = await this.prisma.competitorAccount.findMany({
        where: { enabled: true, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: compDueBefore } }] },
        take: ROUND_MAX_COMPETITORS,
      });
      for (const c of comps) {
        if (summary.skipped.has(c.platform)) continue;
        try {
          const r = await this.syncCompetitor(c.id, c.brandId);
          summary.competitors += 1;
          summary.inserted += r.inserted;
          summary.updated += r.updated;
        } catch (e) {
          if (e instanceof SessionMissingError || e instanceof PlatformBlockedError) summary.skipped.add(c.platform);
          else this.logger.warn(`竞品同步失败 ${c.nickname}: ${(e as Error).message?.split('\n')[0]}`);
        }
        await sleep(3000 + Math.floor(Math.random() * 2000));
      }

      this.lastRoundAt = new Date();
      if (summary.tasks || summary.competitors) {
        this.logger.log(
          `抓取轮完成：任务 ${summary.tasks}，竞品 ${summary.competitors}，新增 ${summary.inserted}，更新 ${summary.updated}`,
        );
      }
      return { tasks: summary.tasks, inserted: summary.inserted, updated: summary.updated, skipped_platforms: [...summary.skipped], competitors: summary.competitors };
    } finally {
      this.roundRunning = false;
    }
  }

  /** 调度间隔（供 scheduler 使用） */
  get roundIntervalMinutes() {
    return ROUND_INTERVAL_MINUTES;
  }
}
