import { Injectable } from '@nestjs/common';
import { SparkApiClient } from '../../spark/spark-api.client';
import { PullCtx, SourceConnector } from '../ingest.contract';
import { mccNum, targetRowMap } from '../target-row';

/** 线索分析行(线索管理→线索分析,归属账户×日;MDD/奕境漏斗留资口径) */
export interface ClueAnalysisRow {
  entity: 'clue_analysis';
  day: string;
  subUserId: string;
  subUserName: string | null;
  proUserId: string | null;
  proUserName: string | null;
  clueCnt: number;
  adsClueCnt: number;
  natureClueCnt: number;
  leadsUserCnt: number;
}

/** 线索分析·获客工具统计行(归属账户×日私信进线/开口总数+留资组件拆分;漏斗进线/开口口径) */
export interface ClueAcqToolRow {
  entity: 'clue_acq_tool';
  day: string;
  subUserId: string; // = pro_user_id
  subUserName: string | null;
  consultCnt: number;
  chatCnt: number;
  msgLeads: number;
  serviceCardLeads: number;
  wecomCardLeads: number;
  bookingLeads: number;
  landingPageLeads: number;
  wechatCopyLeads: number;
  tradeCardLeads: number;
}

/**
 * MCC 连接器(P4 第一片,架构蓝图 v2 L2):把「线索分析/获客工具统计」两实体的
 * 拉取+标准化收敛于此;HTTP/会话细节仍在 SparkApiClient。持久化(upsert)留在 spark.service。
 * 后续 notes/campaign/staff 按同契约迁入。
 */
@Injectable()
export class MccConnector implements SourceConnector {
  readonly id = 'mcc';
  readonly credentialDeps = ['cookie'];

  constructor(private readonly api: SparkApiClient) {}

  /** 线索分析日维度行(单日窗口;与原 syncClueAnalysis 拉取逻辑一致) */
  async pullClueAnalysis(ctx: PullCtx, day: string): Promise<{ rows: ClueAnalysisRow[]; total: number }> {
    const rawRows: Record<string, unknown>[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= 40; pageNo++) {
      const data = await this.api.clueAnalysisList({ start: day, end: day, timeDim: 'date_key', pageNo, pageSize: 200 }, ctx);
      total = data.total;
      rawRows.push(...data.rows);
      if (rawRows.length >= total || !data.rows.length) break;
    }
    const rows = rawRows.map((r): ClueAnalysisRow => {
      const m = targetRowMap(r);
      const str = (v: unknown) => String(v ?? '').trim();
      return {
        entity: 'clue_analysis',
        day: str(m.get('date_key')),
        subUserId: str(m.get('sub_user_id')),
        subUserName: str(m.get('sub_user_name')) || null,
        proUserId: str(m.get('pro_user_id')) || null,
        proUserName: str(m.get('pro_user_name')) || null,
        clueCnt: mccNum(m.get('new_clue_cnt')),
        adsClueCnt: mccNum(m.get('new_ads_clue_cnt')),
        natureClueCnt: mccNum(m.get('new_nature_clue_cnt')),
        leadsUserCnt: mccNum(m.get('leads_user_cnt')),
      };
    });
    return { rows, total };
  }

  /** 获客工具统计行(滚动 7 天窗口锚定 end;行按自身 date_key 落库;date_key 必传——缺了整行落不了库) */
  async pullClueAcqTool(ctx: PullCtx, start: string, end: string): Promise<{ rows: ClueAcqToolRow[]; total: number }> {
    const rawRows: Record<string, unknown>[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= 40; pageNo++) {
      const data = await this.api.clueAcqToolList({ start, end, timeDim: 'date_key', pageNo, pageSize: 200 }, ctx);
      total = data.total;
      rawRows.push(...data.rows);
      if (rawRows.length >= total || !data.rows.length) break;
    }
    const rows = rawRows.map((r): ClueAcqToolRow => {
      const m = targetRowMap(r);
      const str = (v: unknown) => String(v ?? '').trim();
      return {
        entity: 'clue_acq_tool',
        day: str(m.get('date_key')),
        subUserId: str(m.get('pro_user_id')),
        subUserName: str(m.get('pro_user_name')) || null,
        consultCnt: mccNum(m.get('is_consult')),
        chatCnt: mccNum(m.get('is_chat')),
        msgLeads: mccNum(m.get('is_msg_leads')),
        serviceCardLeads: mccNum(m.get('is_service_card_leads')),
        wecomCardLeads: mccNum(m.get('is_qw_add_leads')),
        bookingLeads: mccNum(m.get('is_book_comp_leads')),
        landingPageLeads: mccNum(m.get('is_landing_page_leads')),
        wechatCopyLeads: mccNum(m.get('is_wechat_leads')),
        tradeCardLeads: mccNum(m.get('is_app_card_leads')),
      };
    });
    return { rows, total };
  }
}
