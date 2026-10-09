import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const dayKey08 = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
/** 员工数据「日」档 dateType（与 pro.service.ts 保持一致） */
export const PRO_STAFF_DAY_DATE_TYPE = Number(process.env.PRO_STAFF_DAY_DATE_TYPE ?? 4) || 4;

export interface ProMatrixResult {
  rows: {
    userId: string;
    nickName: string;
    createNoteNum: number;
    socImpCnt: number;
    socClickCnt: number;
    socEnageCnt: number;
    messageOpenCnt: number;
    messageDrivingOpenCnt: number;
    msgLeadsNum: number;
    leadsSuccess: number;
  }[];
  source: 'daily' | 'snapshot';
  dateType: number;
  /** 日档=覆盖的天数；快照=分区日 */
  statDate: Date;
  dayCount: number;
}

/**
 * 特斯拉员工矩阵窗口数据共享助手（曝光/阅读/互动/发布/私信字段，逐员工行）。
 * - 窗口被日档（dateType=4）逐日分区完整覆盖（今天除外，日档 T+1 产出）→ 逐日行求和：精确窗口，支持 >31 天
 * - 否则回退三档快照（days≤1→1、≤7→2、其余→3，取窗口内最新分区，含「窗口含今日回退昨日」）
 * - 无匹配分区 → null（调用方按内容指标 0 处理，不再回退 KoxNote）
 * 调用方按 nickName→基线账号自行聚合。
 */
@Injectable()
export class ProMatrixService {
  constructor(private prisma: PrismaService) {}

  async proMatrix(brandId: number, start: Date, end: Date): Promise<ProMatrixResult | null> {
    const winStartDay = dayKey08(start);
    const winEndDay = dayKey08(end);
    const yesterdayDay = dayKey08(new Date(Date.now() - 86400000));
    // 窗口内需要逐日覆盖的天（不含今天——日档 T+1 产出；窗口完全在未来则无日档）
    const expectDays: string[] = [];
    const cursor = new Date(`${winStartDay}T00:00:00`);
    while (dayKey08(cursor) <= winEndDay && expectDays.length < 400) {
      const k = dayKey08(cursor);
      if (k <= yesterdayDay) expectDays.push(k);
      cursor.setDate(cursor.getDate() + 1);
    }

    // 1) 日档优先：窗口内（≤昨日）逐日分区完整覆盖 → 逐日行
    if (expectDays.length > 0) {
      const dayRows = await this.prisma.proKosStaff.findMany({
        where: {
          brandId,
          dateType: PRO_STAFF_DAY_DATE_TYPE,
          statDate: { gte: new Date(`${winStartDay}T00:00:00`), lte: new Date(`${winEndDay}T23:59:59.999`) },
        },
        select: {
          userId: true, nickName: true, createNoteNum: true, socImpCnt: true, socClickCnt: true,
          socEnageCnt: true, messageOpenCnt: true, messageDrivingOpenCnt: true, msgLeadsNum: true,
          leadsSuccess: true, statDate: true,
        },
      });
      const covered = new Set(dayRows.map((r) => dayKey08(r.statDate)));
      const fullyCovered = expectDays.every((k) => covered.has(k));
      if (fullyCovered) {
        return {
          rows: dayRows.map((r) => ({
            userId: r.userId,
            nickName: r.nickName,
            createNoteNum: r.createNoteNum,
            socImpCnt: r.socImpCnt,
            socClickCnt: r.socClickCnt,
            socEnageCnt: r.socEnageCnt,
            messageOpenCnt: r.messageOpenCnt,
            messageDrivingOpenCnt: r.messageDrivingOpenCnt,
            msgLeadsNum: r.msgLeadsNum,
            leadsSuccess: r.leadsSuccess,
          })),
          source: 'daily',
          dateType: PRO_STAFF_DAY_DATE_TYPE,
          statDate: new Date(`${[...covered].sort().pop()}T00:00:00`),
          dayCount: covered.size,
        };
      }
    }

    // 2) 回退三档快照：days≤1→1、≤7→2、其余→3；窗口内最新分区；含今日回退昨日
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const dateType = days <= 1 ? 1 : days <= 7 ? 2 : 3;
    const todayDay = dayKey08(new Date());
    const partDays = await this.prisma.proKosStaff.findMany({
      where: { brandId, dateType },
      orderBy: { statDate: 'desc' },
      distinct: ['statDate'],
      select: { statDate: true },
      take: 60,
    });
    const chosen =
      partDays.find((r) => {
        const d = dayKey08(r.statDate);
        return d >= winStartDay && d <= winEndDay;
      }) ??
      (winEndDay === todayDay || winStartDay === todayDay
        ? partDays.find((r) => dayKey08(r.statDate) === yesterdayDay)
        : undefined);
    if (!chosen) return null;
    const rows = await this.prisma.proKosStaff.findMany({
      where: { brandId, statDate: chosen.statDate, dateType },
      take: 2000,
    });
    return {
      rows: rows.map((r) => ({
        userId: r.userId,
        nickName: r.nickName,
        createNoteNum: r.createNoteNum,
        socImpCnt: r.socImpCnt,
        socClickCnt: r.socClickCnt,
        socEnageCnt: r.socEnageCnt,
        messageOpenCnt: r.messageOpenCnt,
        messageDrivingOpenCnt: r.messageDrivingOpenCnt,
        msgLeadsNum: r.msgLeadsNum,
        leadsSuccess: r.leadsSuccess,
      })),
      source: 'snapshot',
      dateType,
      statDate: chosen.statDate,
      dayCount: days,
    };
  }
}
