import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** 单次星火 API 调用的组织上下文（channel=mcc|partner） */
export interface SparkOrgCtx {
  brandId: number;
  orgCode: string;
  cookie: string;
  email?: string | null;
  channel?: string;
  excludeKeywords?: string | null;
}

interface OrgRow {
  brandId: number;
  orgCode: string;
  email: string | null;
  cookie: string;
  channel: string;
  excludeKeywords: string | null;
  active: boolean;
  lastSyncAt: Date | null;
  remark: string | null;
}

/**
 * 星火多组织配置中心：DB为权威源（SparkOrgConfig），内存缓存；
 * .env SPARK_COOKIE/SPARK_ORG_CODE 仅作为 brand 2 的引导兜底（首启自动落库，向后兼容旧部署）
 */
@Injectable()
export class SparkOrgRegistry implements OnModuleInit {
  private readonly logger = new Logger(SparkOrgRegistry.name);
  private cache: OrgRow[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** 首启引导：表空且 .env 有 cookie 时，把 env 转为 brand 2 的 DB 记录 */
  async onModuleInit() {
    try {
      const count = await this.prisma.sparkOrgConfig.count();
      if (count > 0) return;
      const envCookie = (
        this.configService.get<string>('SPARK_COOKIE') ?? ''
      ).trim();
      if (!envCookie) return;
      const orgCode =
        this.configService.get<string>('SPARK_ORG_CODE') ??
        '1942550061000474624';
      await this.prisma.sparkOrgConfig.create({
        data: {
          brandId: 2,
          orgCode,
          cookie: envCookie,
          active: true,
          remark: 'bootstrap from .env',
        },
      });
      this.logger.log('已从 .env 引导生成 brand 2 的星火组织配置');
    } catch (error) {
      this.logger.warn(`星火组织配置引导失败: ${(error as Error).message}`);
    }
  }

  private async load(): Promise<OrgRow[]> {
    if (this.cache) return this.cache;
    this.cache = await this.prisma.sparkOrgConfig.findMany({
      orderBy: { brandId: 'asc' },
    });
    return this.cache;
  }

  invalidate() {
    this.cache = null;
  }

  async list(): Promise<OrgRow[]> {
    return this.load();
  }

  async activeOrgs(): Promise<OrgRow[]> {
    return (await this.load()).filter((o) => o.active);
  }

  /** 按品牌取组织上下文；无 DB 记录时对 brand 2 回退 .env（未落库前的过渡期） */
  async forBrand(brandId?: number): Promise<SparkOrgCtx | null> {
    const rows = await this.load();
    const targetId = brandId ?? rows[0]?.brandId;
    if (!targetId) return null;
    const row = rows.find((o) => o.brandId === targetId);
    if (row) {
      return {
        brandId: row.brandId,
        orgCode: row.orgCode,
        cookie: row.cookie,
        email: row.email,
        channel: row.channel,
        excludeKeywords: row.excludeKeywords,
      };
    }
    if (targetId === 2) {
      const envCookie = (
        this.configService.get<string>('SPARK_COOKIE') ?? ''
      ).trim();
      if (envCookie) {
        return {
          brandId: 2,
          orgCode:
            this.configService.get<string>('SPARK_ORG_CODE') ??
            '1942550061000474624',
          cookie: envCookie,
        };
      }
    }
    return null;
  }

  async setCookie(brandId: number, cookie: string): Promise<SparkOrgCtx> {
    const existing = await this.prisma.sparkOrgConfig.findUnique({
      where: { brandId },
    });
    if (!existing) {
      throw new Error(
        `品牌 ${brandId} 尚无星火组织配置，请先创建 SparkOrgConfig 记录`,
      );
    }
    await this.prisma.sparkOrgConfig.update({
      where: { brandId },
      data: { cookie },
    });
    this.invalidate();
    const ctx = await this.forBrand(brandId);
    this.logger.log(`brand ${brandId} 星火 cookie 已更新落库`);
    return ctx!;
  }

  async markSynced(brandId: number) {
    await this.prisma.sparkOrgConfig
      .update({ where: { brandId }, data: { lastSyncAt: new Date() } })
      .catch(() => undefined);
    this.invalidate();
  }

  async upsertConfig(input: {
    brandId: number;
    orgCode: string;
    email?: string;
    cookie?: string;
    active?: boolean;
    remark?: string;
  }) {
    const data = {
      orgCode: input.orgCode,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.cookie !== undefined ? { cookie: input.cookie } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.remark !== undefined ? { remark: input.remark } : {}),
    };
    const row = await this.prisma.sparkOrgConfig.upsert({
      where: { brandId: input.brandId },
      update: data,
      create: { brandId: input.brandId, ...data },
    });
    this.invalidate();
    return row;
  }
}
