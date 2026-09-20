import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RtbAccountMetrics {
  virtualSellerId: string;
  accountCode?: string;
  type?: number;
  advertiserId?: number;
  brand?: { brandUserId?: string; brandUserName?: string } | null;
  agent?: { agentUserId?: string; agentUserName?: string } | null;
  subAccount?: { agentSubAccountId?: string; agentSubAccountName?: string } | null;
  fee?: string;
  impression?: number;
  click?: number;
  like?: number;
  comment?: number;
  collect?: number;
  share?: number;
  interaction?: number;
  message?: number;
  msgLeadsNum?: number;
  leads?: number;
  lastConsumeDate?: string;
  [key: string]: unknown;
}

export interface RtbMetricsData {
  total: number;
  rtbSummaryMetricsVo?: {
    fee?: string;
    impression?: number;
    click?: number;
    ctr?: string;
    acp?: string;
  } | null;
  rtbAccountMetricsVos?: RtbAccountMetrics[];
}

interface SparkEnvelope<T> {
  code?: number;
  success?: boolean;
  msg?: string;
  message?: string;
  data: T;
}

export class SparkCookieExpiredError extends Error {
  constructor() {
    super('星火登录态已失效（cookie 过期），请重新导出并更新 SPARK_COOKIE');
    this.name = 'SparkCookieExpiredError';
  }
}

const MCC_BASE = 'https://mcc.xiaohongshu.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

@Injectable()
export class SparkApiClient {
  private readonly logger = new Logger(SparkApiClient.name);
  private readonly orgCode: string;
  private cookieOverride: string | null = null;

  constructor(configService: ConfigService) {
    this.orgCode =
      configService.get<string>('SPARK_ORG_CODE') ?? '1942550061000474624';
  }

  /** 运行时热更新 cookie（重启后以 .env 为准） */
  updateCookie(cookie: string) {
    this.cookieOverride = cookie.trim();
  }

  private cookie(configService?: ConfigService): string {
    if (this.cookieOverride) return this.cookieOverride;
    return process.env.SPARK_COOKIE ?? '';
  }

  hasCookie(): boolean {
    return this.cookie().length > 0;
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown> | null,
    referer = `${MCC_BASE}/micro/aurora-data`,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<T> {
    const cookie = this.cookie();
    if (!cookie) {
      throw new Error('星火 API 未配置（SPARK_COOKIE 为空）');
    }
    let res: Response;
    try {
      res = await fetch(`${MCC_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          'User-Agent': UA,
          Origin: MCC_BASE,
          Referer: referer,
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        body: method === 'POST' ? (body === null ? '{}' : JSON.stringify(body)) : undefined,
      });
    } catch (error) {
      throw new Error(`星火 API 网络错误: ${(error as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SparkCookieExpiredError();
    }
    let json: SparkEnvelope<T>;
    try {
      json = (await res.json()) as SparkEnvelope<T>;
    } catch {
      const text = await res.text().catch(() => '');
      if (/login|passport/i.test(res.url) || /登录/.test(text)) {
        throw new SparkCookieExpiredError();
      }
      throw new Error(`星火 API 响应非 JSON（HTTP ${res.status}）`);
    }
    if (json.code !== 0 && json.success !== true) {
      throw new Error(
        `星火 API 错误 code=${json.code} msg=${json.msg ?? json.message}（HTTP ${res.status}）`,
      );
    }
    return json.data;
  }

  /** 聚光投放账户指标（pageIndex 从 1 开始） */
  async rtbMetrics(params: {
    timeStart: string;
    timeEnd: string;
    pageIndex: number;
    pageSize?: number;
  }): Promise<RtbMetricsData> {
    return this.request<RtbMetricsData>('/api/mcc/board/rtb_metrics', {
      timeEnd: params.timeEnd,
      timeStart: params.timeStart,
      showStar: false,
      accountOrgCode: this.orgCode,
      accountCode: '',
      pageIndex: params.pageIndex,
      pageSize: params.pageSize ?? 500,
      tagIds: [],
      launchStatus: '',
    });
  }

  /** vision BI 通用明细（笔记/员工/线索等视图， Phase 2b 启用） */
  async visionDetailList(body: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>(
      '/api/vision/mcc_dashboard/target_detail_list',
      body,
      `${MCC_BASE}/micro/note-data`,
    );
  }

  /** 表格级最新计算分区日（如 2026-09-20）；无值时返回 null */
  async getLatestCalculateDate(tableName: string): Promise<string | null> {
    const data = await this.request<string | null>(
      `/api/mcc/board/get_table_latest_calculate_date?tableName=${encodeURIComponent(tableName)}`,
      null,
      `${MCC_BASE}/micro/clues-data`,
      'GET',
    );
    return typeof data === 'string' && data ? data : null;
  }

  /** cookie 有效性探测 */
  async ping(): Promise<boolean> {
    const date = await this.getLatestCalculateDate(
      'redapp.app_ads_crm_mcc_org_brand_note_df',
    );
    return date !== null;
  }
}
