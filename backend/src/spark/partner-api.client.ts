import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SparkOrgCtx } from './spark-org.registry';

export interface PartnerVsellerRow {
  [key: string]: unknown;
}

export class PartnerCookieExpiredError extends Error {
  constructor() {
    super('合作伙伴平台登录态已失效，请重新登录更新 cookie');
    this.name = 'PartnerCookieExpiredError';
  }
}

const BASE = 'https://partner.xiaohongshu.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 商业化合作伙伴平台（partner.xiaohongshu.com）vision 看板客户端：代理商子账户投放主表 */
@Injectable()
export class PartnerApiClient {
  private readonly logger = new Logger(PartnerApiClient.name);

  constructor(private readonly configService: ConfigService) {}

  private headers(ctx: SparkOrgCtx): Record<string, string> {
    if (!ctx.cookie) throw new Error('合作伙伴平台 cookie 未配置');
    return {
      Cookie: ctx.cookie,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Origin: BASE,
      Referer: `${BASE}/partner/watch-dashboard`,
    };
  }

  /** 子账户投放主表（昨日/今日快照 + 余额 + 在投状态 + 私信三漏斗） */
  async vsellerMonitor(ctx: SparkOrgCtx, pageSize = 100): Promise<PartnerVsellerRow[]> {
    const body = {
      reportCode: '',
      viewAlias: 'partner_customerManage_monitorAssistant_vsellerMonitorView',
      chart: 'virtual_seller',
      dynamicTargets: [
        'virtual_seller_name',
        'virtual_seller_id',
        'status',
        'ads_account_type',
        'brand_company_name',
        'brand_user_name',
        'brand_user_id',
        'is_pre_1_day_put',
        'is_today_put',
        'pre_1_day_cost',
        'today_cost',
        'week_cost',
        'month_cost',
        'pre_1_day_imp_cnt',
        'pre_1_day_click_cnt',
        'pre_1_day_ctr',
        'pre_1_day_cpc',
        'pre_1_day_cpm',
        'pre_1_day_msg_enter_cnt',
        'pre_1_day_msg_open_num',
        'pre_1_day_msg_cvr_leads_cnt',
        'today_imp_cnt',
        'today_click_cnt',
        'today_msg_enter_cnt',
        'today_msg_open_num',
        'today_msg_cvr_leads_cnt',
        'cash_available_balance',
        'credit_available_balance',
      ],
      sorts: [{ sortField: 'pre_1_day_cost', sortType: 'desc' }],
      page: { pageNo: 1, pageSize },
      frontFilterList: [
        {
          filterField: 'status',
          filterType: 20,
          selectFilter: {
            selectType: 20,
            selectShowType: 0,
            valueSource: 0,
            selectLabels: [{ labelValue: '全部', labelName: '全部', selected: 1 }],
          },
        },
      ],
      compFrontFilterList: [],
    };
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/vision/dashboard/target_detail_list`, {
        method: 'POST',
        headers: this.headers(ctx),
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`合作伙伴平台网络错误: ${(error as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new PartnerCookieExpiredError();
    const j = (await res.json().catch(() => ({}))) as {
      code?: number;
      success?: boolean;
      msg?: string;
      data?: { detailListVo?: { detailDataList?: PartnerVsellerRow[]; detailVoList?: PartnerVsellerRow[] } };
    };
    if (res.url.includes('login') || /登录|ticket/.test(j.msg ?? '')) {
      throw new PartnerCookieExpiredError();
    }
    if (j.code !== 0 && j.success !== true) {
      throw new Error(`合作伙伴平台错误 code=${j.code} msg=${j.msg}（HTTP ${res.status}）`);
    }
    const vo = j.data?.detailListVo ?? {};
    const raw = vo.detailDataList ?? vo.detailVoList ?? [];
    // 行结构为 targetList/targetVos 嵌套 → 扁平化为 {targetCode: value}
    const rows = raw.map((row) => {
      const flat: PartnerVsellerRow = { ...row };
      const rawList = Array.isArray(row.targetList) ? row.targetList : row.targetVos;
      const list = (rawList ?? []) as {
        targetCode?: string;
        targetValue?: unknown;
        targetOriginValue?: unknown;
        targetDownloadValue?: unknown;
      }[];
      for (const t of list) {
        const code = t.targetCode;
        if (!code) continue;
        const val =
          t.targetValue != null && t.targetValue !== ''
            ? t.targetValue
            : t.targetOriginValue != null && t.targetOriginValue !== ''
              ? t.targetOriginValue
              : t.targetDownloadValue;
        flat[code] = val;
      }
      return flat;
    });
    return rows;
  }

  /** cookie 有效性探测 */
  async ping(ctx: SparkOrgCtx): Promise<boolean> {
    try {
      const rows = await this.vsellerMonitor(ctx, 1);
      return rows.length >= 0;
    } catch (e) {
      if (e instanceof PartnerCookieExpiredError) return false;
      throw e;
    }
  }
}
