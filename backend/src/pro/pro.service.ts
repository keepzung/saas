import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';

const PRO_BASE = 'https://pro.xiaohongshu.com';
const DATA_PAGE = `${PRO_BASE}/enterprise/data/get-customer`;

interface ProOverview {
  kosAccountNum: number;
  rtbAccountNum: number;
  createNoteNum: number;
  rtbNoteNum: number;
  socReadCnt: number;
  adsReadCnt: number;
  messageOpenCnt: number;
  messageDrivingOpenCnt: number;
  msgLeadsNum: number;
  leadsSuccess: number;
  rtbIncomeAmt: string | number;
}

interface ProStaff {
  userId: string;
  nickName: string;
  realName?: string;
  headUrl?: string;
  area?: { country?: string; province?: string; city?: string };
  createNoteNum?: number;
  rtbNoteNum?: number;
  socImpCnt?: number;
  socClickCnt?: number;
  socEnageCnt?: number;
  messageOpenCnt?: number;
  messageDrivingOpenCnt?: number;
  msgLeadsNum?: number;
  leadsSuccess?: number;
  rtbIncomeAmt?: string | number;
  interestsStatus?: number;
  bindTime?: number;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class ProService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProService.name);
  private syncing = new Set<number>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private autoSyncRunning = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const minutes = Number(process.env.PRO_SYNC_INTERVAL_MINUTES ?? 60);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('专业号定时同步已禁用（PRO_SYNC_INTERVAL_MINUTES<=0）');
      return;
    }
    // 启动后 2 分钟先试一次，之后按间隔检查（20 小时内已同步则跳过，快照日更即可）
    setTimeout(() => {
      this.safeAutoSync().catch(() => undefined);
    }, 120_000).unref();
    this.syncTimer = setInterval(() => {
      this.safeAutoSync().catch(() => undefined);
    }, minutes * 60_000);
    this.syncTimer.unref();
    this.logger.log(`专业号定时同步已启动：每 ${minutes} 分钟检查（20 小时内已同步则跳过）`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  private async safeAutoSync() {
    if (this.autoSyncRunning) return;
    this.autoSyncRunning = true;
    try {
      const cfgs = await this.prisma.proOrgConfig.findMany({
        where: { active: true, storageState: { not: '' } },
        select: { brandId: true, lastSyncAt: true },
      });
      for (const cfg of cfgs) {
        if (cfg.lastSyncAt && Date.now() - cfg.lastSyncAt.getTime() < 20 * 3600_000) continue;
        try {
          // 超时保护：Playwright 被 shield 卡住时不无限挂起，下轮重试
          const r = await Promise.race([
            this.sync(cfg.brandId),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('同步超时（15分钟），下轮重试')), 15 * 60_000).unref(),
            ),
          ]);
          this.logger.log(`专业号自动同步完成 brand=${cfg.brandId}: ${JSON.stringify(r).slice(0, 200)}`);
        } catch (e) {
          this.logger.warn(`专业号自动同步失败 brand=${cfg.brandId}: ${String(e?.message ?? e).slice(0, 200)}`);
        }
      }
    } finally {
      this.autoSyncRunning = false;
    }
  }

  async status(brandId: number) {
    const cfg = await this.prisma.proOrgConfig.findUnique({ where: { brandId } });
    const [overviewCount, staffCount] = await Promise.all([
      this.prisma.proKosOverview.count({ where: { brandId } }),
      this.prisma.proKosStaff.count({ where: { brandId } }),
    ]);
    const latestStaff = await this.prisma.proKosStaff.findFirst({
      where: { brandId },
      orderBy: { statDate: 'desc' },
      select: { statDate: true },
    });
    return {
      brand_id: brandId,
      configured: Boolean(cfg?.storageState),
      active: cfg?.active ?? false,
      last_sync_at: cfg?.lastSyncAt ?? null,
      overview_rows: overviewCount,
      staff_rows: staffCount,
      latest_staff_stat_date: latestStaff?.statDate ?? null,
    };
  }

  async saveStorageState(brandId: number, storageState: string) {
    const existing = await this.prisma.proOrgConfig.findUnique({ where: { brandId } });
    if (existing) {
      await this.prisma.proOrgConfig.update({
        where: { brandId },
        data: { storageState, active: true },
      });
    } else {
      await this.prisma.proOrgConfig.create({
        data: { brandId, storageState },
      });
    }
    return { ok: true, brand_id: brandId };
  }

  /** 专业号 KOS 数据同步（Playwright 浏览器上下文 fetch，绕 shield）：近1日/近7日/近30日 三档窗口 */
  async sync(brandId: number): Promise<Record<string, unknown>> {
    if (this.syncing.has(brandId)) {
      throw new Error('该品牌的专业号同步正在进行中');
    }
    const cfg = await this.prisma.proOrgConfig.findUnique({ where: { brandId } });
    if (!cfg?.storageState) {
      throw new NotFoundException(`品牌 ${brandId} 尚无专业号登录态，请先推送 storageState`);
    }
    this.syncing.add(brandId);
    try {
      const { windows } = await this.fetchProData(brandId, cfg.storageState);
      const statDate = this.yesterday();

      let staffUpserted = 0;
      let avatarsUpdated = 0;
      const syncedTypes: number[] = [];
      for (const dateType of [1, 2, 3]) {
        const fetched = windows[dateType];
        if (!fetched) continue;
        const { overview, staff } = fetched;
        const win = this.windowFor(dateType);
        syncedTypes.push(dateType);

        await this.prisma.proKosOverview.upsert({
          where: {
            brandId_statDate_dateType: { brandId, statDate, dateType },
          },
          create: {
            brandId,
            statDate,
            dateType,
            startDate: win.start,
            endDate: win.end,
            kosAccountNum: num(overview?.kosAccountNum),
            rtbAccountNum: num(overview?.rtbAccountNum),
            createNoteNum: num(overview?.createNoteNum),
            rtbNoteNum: num(overview?.rtbNoteNum),
            socReadCnt: num(overview?.socReadCnt),
            adsReadCnt: num(overview?.adsReadCnt),
            messageOpenCnt: num(overview?.messageOpenCnt),
            messageDrivingOpenCnt: num(overview?.messageDrivingOpenCnt),
            msgLeadsNum: num(overview?.msgLeadsNum),
            leadsSuccess: num(overview?.leadsSuccess),
            rtbIncomeAmt: num(overview?.rtbIncomeAmt),
          },
          update: {
            startDate: win.start,
            endDate: win.end,
            kosAccountNum: num(overview?.kosAccountNum),
            rtbAccountNum: num(overview?.rtbAccountNum),
            createNoteNum: num(overview?.createNoteNum),
            rtbNoteNum: num(overview?.rtbNoteNum),
            socReadCnt: num(overview?.socReadCnt),
            adsReadCnt: num(overview?.adsReadCnt),
            messageOpenCnt: num(overview?.messageOpenCnt),
            messageDrivingOpenCnt: num(overview?.messageDrivingOpenCnt),
            msgLeadsNum: num(overview?.msgLeadsNum),
            leadsSuccess: num(overview?.leadsSuccess),
            rtbIncomeAmt: num(overview?.rtbIncomeAmt),
          },
        });

        for (const s of staff) {
          if (!s?.userId) continue;
          const area = s.area ?? {};
          const data = {
            nickName: s.nickName ?? '',
            realName: s.realName ?? null,
            avatar: s.headUrl ?? null,
            province: area.province ?? null,
            city: area.city ?? null,
            createNoteNum: num(s.createNoteNum),
            rtbNoteNum: num(s.rtbNoteNum),
            socImpCnt: num(s.socImpCnt),
            socClickCnt: num(s.socClickCnt),
            socEnageCnt: num(s.socEnageCnt),
            messageOpenCnt: num(s.messageOpenCnt),
            messageDrivingOpenCnt: num(s.messageDrivingOpenCnt),
            msgLeadsNum: num(s.msgLeadsNum),
            leadsSuccess: num(s.leadsSuccess),
            rtbIncomeAmt: num(s.rtbIncomeAmt),
            interestsStatus: s.interestsStatus ?? null,
            bindTime: s.bindTime ? new Date(s.bindTime) : null,
          };
          await this.prisma.proKosStaff.upsert({
            where: {
              brandId_userId_statDate_dateType: { brandId, userId: s.userId, statDate, dateType },
            },
            create: { brandId, userId: s.userId, statDate, dateType, ...data },
            update: data,
          });
          staffUpserted++;
          // 同步头像到 KosAccount（按昵称匹配，仅 7 日档执行一次即可）
          if (dateType === 2 && data.avatar && data.nickName) {
            const acc = await this.prisma.kosAccount.findFirst({
              where: { brandId, nickname: data.nickName },
              select: { id: true, avatar: true },
            });
            if (acc && acc.avatar !== data.avatar) {
              await this.prisma.kosAccount.update({ where: { id: acc.id }, data: { avatar: data.avatar } });
              avatarsUpdated++;
            }
          }
        }
      }

      await this.prisma.proOrgConfig.update({
        where: { brandId },
        data: { lastSyncAt: new Date() },
      });
      this.logger.log(
        `brand ${brandId} 专业号同步完成：dateType [${syncedTypes.join('/')}]，staff ${staffUpserted}（头像更新 ${avatarsUpdated}）`,
      );
      return {
        ok: true,
        brand_id: brandId,
        stat_date: statDate,
        synced_date_types: syncedTypes,
        staff_upserted: staffUpserted,
        avatars_updated: avatarsUpdated,
      };
    } finally {
      this.syncing.delete(brandId);
    }
  }

  /** dateType 1/2/3 → 统计窗口（T+1：终点=昨天；近1日/近7日/近30日） */
  private windowFor(dateType: number): { start: Date; end: Date } {
    const end = this.yesterday();
    if (dateType === 1) return { start: end, end };
    const days = dateType === 2 ? 7 : 30;
    return { start: this.daysAgo(days), end };
  }

  /** 浏览器上下文 fetch（shield 反爬使纯 fetch 不可用）：逐窗口拉 overview + staff 全量 */
  private async fetchProData(
    brandId: number,
    storageStateJson: string,
  ): Promise<{
    windows: Record<number, { overview: ProOverview | null; staff: ProStaff[] }>;
  }> {
    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    const exe = this.resolveChromium();
    const browser = await chromium.launch({
      executablePath: exe ?? undefined,
      headless: true,
      args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
    });
    try {
      const ctx = await browser.newContext({
        storageState: JSON.parse(storageStateJson),
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'zh-CN',
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();

      let loaded = false;
      for (let i = 1; i <= 4; i++) {
        try {
          await page.goto(DATA_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
          loaded = true;
          break;
        } catch (e) {
          this.logger.warn(`brand ${brandId} pro 页面加载重试 ${i}: ${(e as Error).message.split('\n')[0]}`);
          await page.waitForTimeout(3000);
        }
      }
      if (!loaded) throw new Error('专业号数据页加载失败（网络）');
      await page.waitForTimeout(5000);

      const windows: Record<number, { overview: ProOverview | null; staff: ProStaff[] }> = {};
      for (const dateType of [1, 2, 3]) {
        const win = this.windowFor(dateType);
        const overview = (await page
          .evaluate(
            async ({ p, body }) => {
              const res = await fetch(p, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
              });
              return res.json();
            },
            {
              p: '/api/edith/ads/pro/kos/data/overview',
              body: { dateType, startDate: fmt(win.start), endDate: fmt(win.end) },
            },
          )
          .catch(() => null)) as { code?: number; data?: ProOverview } | null;
        if ((overview as { code?: number })?.code !== 0) {
          this.logger.warn(
            `brand ${brandId} pro overview dateType=${dateType} 拉取失败: ${JSON.stringify(overview).slice(0, 160)}`,
          );
          continue;
        }

        const staff: ProStaff[] = [];
        for (let pageNum = 1; pageNum <= 10; pageNum++) {
          const j = (await page
            .evaluate(
              async ({ p, body }) => {
                const res = await fetch(p, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(body),
                });
                return res.json();
              },
              {
                p: '/api/edith/ads/pro/kos/data/staff/list',
                body: {
                  kosUserId: '',
                  area: { country: '', province: '', city: '' },
                  staffLabel: '',
                  pageNum,
                  pageSize: 100,
                  dateType,
                  interestsStatus: 2,
                  startDate: fmt(win.start),
                  endDate: fmt(win.end),
                  orderClauses: [],
                },
              },
            )
            .catch(() => null)) as { code?: number; data?: { dtos?: ProStaff[]; total?: number } } | null;
          const rows = j?.data?.dtos ?? [];
          staff.push(...rows);
          const total = j?.data?.total ?? 0;
          if (staff.length >= total || rows.length === 0) break;
        }
        windows[dateType] = { overview: overview?.data ?? null, staff };
        this.logger.log(`brand ${brandId} 专业号拉取 dateType=${dateType}：staff ${staff.length}`);
      }
      return { windows };
    } finally {
      await browser.close();
    }
  }

  private resolveChromium(): string | null {
    try {
      const pw = require('playwright-core') as typeof import('playwright-core');
      const p = pw.chromium.executablePath();
      if (p && fs.existsSync(p)) return p;
    } catch { /* fallthrough */ }
    // 兜底：扫描 ms-playwright 缓存
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
        for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux']) {
          const exe = path.join(base, d, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
          if (fs.existsSync(exe)) return exe;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  private yesterday(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);
