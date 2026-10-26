import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { classifyByRules, MddCategoryService } from './mdd-category.service';
import { MDD_CATEGORY_LIST, mddCategoryOf } from './kox.service';

/** 数值安全解析 */
const n = (v: unknown) => {
  const num = Number(v ?? 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
};
const monthKey = (d: Date) => {
  const s = new Date(d.getTime() + 8 * 3600000).toISOString();
  return s.slice(0, 7);
};

/** MDD 门店名规范化：客户底表中的历史写法统一 */
export function canonicalMddStore(name: unknown): string {
  const s = String(name ?? '').trim();
  if (!s) return s;
  if (/^深圳罗湖万象城$/.test(s)) return '深圳万象城';
  if (/^南京德基(店)?$/.test(s)) return '南京德基';
  if (/^上海久光$/.test(s)) return '上海久光百货';
  if (/^成都skp$/i.test(s)) return '成都SKP';
  return s;
}

/** 参考爆文聚合行（窗口内日维度求和） */
interface NoteAgg {
  noteId: string;
  title: string;
  url: string | null;
  author: string | null;
  category: string;
  views: number;
  engagement: number;
  pmOpenings: number;
  leads: number;
}

@Controller('mdd/sales')
@UseGuards(JwtAuthGuard)
export class MddSalesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mddCategory: MddCategoryService,
  ) {}

  /** 销售顾问 → 门店 映射：KOS 昵称后缀 → 使用人（基线 operatorName）；均未命中返回 null（未分配） */
  private async staffStoreMaps() {
    const accs = await this.prisma.kosAccount.findMany({
      where: { brandId: 5 },
      select: { nickname: true, operatorName: true, storeName: true, status: true },
      orderBy: { status: 'asc' },
    });
    const bySuffix = new Map<string, string>();
    const byOperator = new Map<string, string>();
    for (const a of accs) {
      const store = canonicalMddStore(a.storeName ?? '');
      if (!store) continue;
      if (a.operatorName?.trim() && !byOperator.has(a.operatorName.trim())) {
        byOperator.set(a.operatorName.trim(), store);
      }
      const m = a.nickname.match(/[-－]\s*([^-－]+)\s*$/);
      if (m?.[1]?.trim() && !bySuffix.has(m[1].trim())) bySuffix.set(m[1].trim(), store);
    }
    return { bySuffix, byOperator };
  }

  /** 销售顾问（支持 "A/B" 多人）→ 门店；均未命中 = 未分配 */
  private mapStaffStore(staff: string | null | undefined, maps: { bySuffix: Map<string, string>; byOperator: Map<string, string> }): string {
    const s = String(staff ?? '').trim();
    if (!s) return '未分配';
    const parts = s.split(/[/、,，]/).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      const hit = maps.bySuffix.get(part) ?? maps.byOperator.get(part);
      if (hit) return hit;
    }
    return '未分配';
  }

  /** Excel 导入（前端解析后按行提交；月+门店+品系 upsert） */
  @Post('import')
  async import(
    @Body()
    dto: {
      rows?: {
        month?: string;
        storeName?: string;
        province?: string;
        productLine?: string;
        quantity?: number | string;
        amount?: number | string;
        remark?: string;
      }[];
    },
  ) {
    const rows = dto?.rows ?? [];
    if (!rows.length) throw new BadRequestException('rows 不能为空');
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const month = String(r.month ?? '').trim();
      const storeName = String(r.storeName ?? '').trim();
      const productLine = String(r.productLine ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(month) || !storeName || !productLine) {
        errors.push(`第 ${i + 1} 行：月份(YYYY-MM)/门店/品系 缺失或格式错误`);
        continue;
      }
      const quantity = n(r.quantity);
      const amount = r.amount != null && r.amount !== '' ? String(r.amount) : null;
      const province = r.province ? String(r.province).trim() : null;
      const res = await this.prisma.mddChannelSale.upsert({
        where: {
          brandId_month_storeName_productLine: {
            brandId: 5,
            month,
            storeName,
            productLine,
          },
        },
        create: {
          brandId: 5,
          month,
          storeName,
          province,
          productLine,
          quantity,
          amount,
          remark: r.remark ? String(r.remark) : null,
        },
        update: { quantity, amount, province, remark: r.remark ? String(r.remark) : null },
      });
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created += 1;
      else updated += 1;
    }
    return { created, updated, skipped: errors.length, errors: errors.slice(0, 20) };
  }

  /** 订单明细导入（前端解析客户底表 xlsx；行级 upsert：dedupKey 防重复；顾问→门店自动归属） */
  @Post('import-orders')
  async importOrders(
    @Body()
    dto: {
      rows?: {
        date?: string | null;
        orderSeq?: string | number | null;
        internalNo?: string | null;
        customerName?: string | null;
        phone?: string | number | null;
        repurchase?: string | null;
        channel?: string | null;
        productModel?: string | null;
        productName?: string | null;
        color?: string | null;
        size?: string | number | null;
        quantity?: number | string | null;
        unitPrice?: number | string | null;
        discountSub?: number | string | null;
        amount?: number | string | null;
        staff?: string | null;
        remark?: string | null;
      }[];
    },
  ) {
    const rows = dto?.rows ?? [];
    if (!rows.length) throw new BadRequestException('rows 不能为空');
    const maps = await this.staffStoreMaps();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const unmatchedStaff = new Set<string>();
    // 行序计数（同订单多行），dedupKey 便于重复导入幂等
    const lineCounter = new Map<string, number>();
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const date = r.date ? new Date(`${String(r.date).slice(0, 10)}T00:00:00+08:00`) : null;
      if (!date || Number.isNaN(date.getTime())) {
        errors.push(`第 ${i + 1} 行：日期缺失或格式错误`);
        continue;
      }
      const month = monthKey(date);
      const orderSeq = r.orderSeq != null && r.orderSeq !== '' ? String(r.orderSeq) : null;
      const internalNo = r.internalNo != null && r.internalNo !== '' ? String(r.internalNo) : null;
      const productModel = r.productModel ? String(r.productModel).trim() : '';
      const staff = r.staff ? String(r.staff).trim() : null;
      const lineIdx = lineCounter.get(`${orderSeq}|${internalNo}`) ?? 0;
      lineCounter.set(`${orderSeq}|${internalNo}`, lineIdx + 1);
      const dedupKey = `${month}|${orderSeq ?? ''}|${internalNo ?? ''}|${productModel}|${lineIdx}`;
      const storeName = this.mapStaffStore(staff, maps);
      if (storeName === '未分配' && staff) unmatchedStaff.add(staff);
      const data = {
        brandId: 5,
        month,
        date,
        orderSeq,
        internalNo,
        customerName: r.customerName ? String(r.customerName).trim() : null,
        phone: r.phone != null && r.phone !== '' ? String(r.phone).trim() : null,
        repurchase: r.repurchase ? String(r.repurchase).trim() : null,
        channel: r.channel ? String(r.channel).trim() : null,
        productModel: productModel || null,
        productName: r.productName ? String(r.productName).trim() : null,
        category: await this.mddCategory.classify(r.productName),
        color: r.color ? String(r.color).trim() : null,
        size: r.size != null && r.size !== '' ? String(r.size) : null,
        quantity: n(r.quantity),
        unitPrice: r.unitPrice != null && r.unitPrice !== '' ? String(r.unitPrice) : null,
        discountSub: r.discountSub != null && r.discountSub !== '' ? String(r.discountSub) : null,
        amount: r.amount != null && r.amount !== '' ? String(r.amount) : null,
        staff,
        storeName,
        remark: r.remark ? String(r.remark) : null,
      };
      const res = await this.prisma.mddSalesOrder.upsert({
        where: { dedupKey },
        create: { ...data, dedupKey },
        update: data,
      });
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created += 1;
      else updated += 1;
    }
    return {
      created,
      updated,
      skipped: errors.length,
      errors: errors.slice(0, 20),
      unmatched_staff: [...unmatchedStaff],
    };
  }

  /** 订单明细分页（手机号可见，供销售看板「订单明细」tab；筛选：月份区间/门店/顾问/关键字） */
  @Get('orders')
  async orders(
    @Query()
    query: {
      startMonth?: string;
      endMonth?: string;
      storeName?: string;
      staff?: string;
      keyword?: string;
      page?: string;
      page_size?: string;
    },
  ) {
    const today = monthKey(new Date());
    const endMonth = /^\d{4}-\d{2}$/.test(query.endMonth ?? '') ? (query.endMonth as string) : today;
    const startMonth = /^\d{4}-\d{2}$/.test(query.startMonth ?? '')
      ? (query.startMonth as string)
      : `${endMonth.slice(0, 4)}-01`;
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.page_size ?? 20) || 20));
    const where = {
      brandId: 5,
      month: { gte: startMonth, lte: endMonth },
      ...(query.storeName ? { storeName: query.storeName } : {}),
      ...(query.staff ? { staff: query.staff } : {}),
      ...(query.keyword
        ? {
            OR: [
              { customerName: { contains: query.keyword } },
              { phone: { contains: query.keyword } },
              { productName: { contains: query.keyword } },
              { staff: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [total, rows, all] = await Promise.all([
      this.prisma.mddSalesOrder.count({ where }),
      this.prisma.mddSalesOrder.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.mddSalesOrder.findMany({ where, select: { quantity: true, amount: true, staff: true, storeName: true, phone: true, repurchase: true } }),
    ]);
    // 汇总（随筛选联动）
    const qty = all.reduce((a, r) => a + n(r.quantity), 0);
    const amount = all.reduce((a, r) => a + Number(r.amount ?? 0), 0);
    const phoneSet = new Set(all.map((r) => r.phone).filter(Boolean));
    const repurchasePhones = new Set(all.filter((r) => r.repurchase === '是').map((r) => r.phone).filter(Boolean));
    const byStaff = new Map<string, { staff: string; qty: number; amount: number }>();
    for (const r of all) {
      const k = r.staff || '未分配';
      const cur = byStaff.get(k) ?? { staff: k, qty: 0, amount: 0 };
      cur.qty += n(r.quantity);
      cur.amount += Number(r.amount ?? 0);
      byStaff.set(k, cur);
    }
    return {
      total,
      page,
      page_size: pageSize,
      list: rows,
      summary: {
        orders: all.length,
        qty,
        amount: Math.round(amount * 100) / 100,
        customers: phoneSet.size,
        repurchase_rate: phoneSet.size
          ? Math.round(([...repurchasePhones].length / phoneSet.size) * 1000) / 10
          : 0,
      },
      staff_ranking: [...byStaff.values()].sort((a, b) => b.qty - a.qty),
      facets: {
        stores: [...new Set(all.map((r) => r.storeName).filter(Boolean))].sort(),
        staff: [...new Set(all.map((r) => r.staff).filter(Boolean))].sort(),
      },
    };
  }

  /** 轻量销售汇总（代理商总览「成交转化」卡）：日期窗口内订单台数/金额 */
  @Get('summary')
  async summary(
    @Query() query: { start?: string; end?: string; startMonth?: string; endMonth?: string },
  ) {
    let startMonth = query.startMonth ?? '';
    let endMonth = query.endMonth ?? '';
    if ((!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) && query.start && query.end) {
      startMonth = query.start.slice(0, 7);
      endMonth = query.end.slice(0, 7);
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
      const today = monthKey(new Date());
      startMonth = `${today.slice(0, 4)}-01`;
      endMonth = today;
    }
    const rows = await this.prisma.mddSalesOrder.findMany({
      where: { brandId: 5, month: { gte: startMonth, lte: endMonth } },
      select: { quantity: true, amount: true },
    });
    return {
      start_month: startMonth,
      end_month: endMonth,
      orders: rows.length,
      qty: rows.reduce((a, r) => a + n(r.quantity), 0),
      amount: Math.round(rows.reduce((a, r) => a + Number(r.amount ?? 0), 0) * 100) / 100,
    };
  }

  /** 按标签/备注修改留资会话属性（预留） */
  @Patch('orders/:id/remark')
  async updateOrderRemark(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { remark?: string },
  ) {
    await this.prisma.mddSalesOrder.update({
      where: { id },
      data: { remark: dto.remark ? String(dto.remark).slice(0, 200) : null },
    });
    return { ok: true };
  }

  /** 看板：三卡（总线索/总销量/总转化率）+ 月度×品系趋势 + 品系排行 + 门店明细 */
  @Get('dashboard')
  async dashboard(
    @Query()
    query: {
      startMonth?: string;
      endMonth?: string;
      province?: string;
      productLine?: string;
    },
  ) {
    const today = monthKey(new Date());
    const endMonth = /^\d{4}-\d{2}$/.test(query.endMonth ?? '')
      ? (query.endMonth as string)
      : today;
    const startMonth = /^\d{4}-\d{2}$/.test(query.startMonth ?? '')
      ? (query.startMonth as string)
      : `${endMonth.slice(0, 4)}-01`;

    const where = {
      brandId: 5,
      month: { gte: startMonth, lte: endMonth },
      ...(query.province ? { province: query.province } : {}),
      ...(query.productLine ? { productLine: query.productLine } : {}),
    };
    const rows = await this.prisma.mddChannelSale.findMany({ where });

    // 订单级明细（9月起客户底表）：有数据时销量/转化卡以订单为准，与「订单明细」tab 同源
    const orderRows = await this.prisma.mddSalesOrder.findMany({
      where: { brandId: 5, month: { gte: startMonth, lte: endMonth } },
      select: { quantity: true, amount: true, staff: true, storeName: true, productName: true, repurchase: true, phone: true, date: true },
    });
    const orderQty = orderRows.reduce((a, r) => a + n(r.quantity), 0);
    const orderAmount =
      Math.round(orderRows.reduce((a, r) => a + Number(r.amount ?? 0), 0) * 100) / 100;
    const staffRankingMap = new Map<string, { staff: string; qty: number; amount: number }>();
    for (const r of orderRows) {
      const k = r.staff || '未分配';
      const cur = staffRankingMap.get(k) ?? { staff: k, qty: 0, amount: 0 };
      cur.qty += n(r.quantity);
      cur.amount += Number(r.amount ?? 0);
      staffRankingMap.set(k, cur);
    }
    const phoneSet = new Set(orderRows.map((r) => r.phone).filter(Boolean));
    const repurchasePhones = new Set(
      orderRows.filter((r) => r.repurchase === '是').map((r) => r.phone).filter(Boolean),
    );
    const useOrders = orderRows.length > 0;

    // 线索（来鼓）：同窗口内留资会话数（账户维度，不随门店/品系筛选联动）
    const winStart = new Date(`${startMonth}-01T00:00:00+08:00`);
    const winEndEx = new Date(
      new Date(`${endMonth}-01T00:00:00+08:00`).getTime() + 31 * 86400000,
    );
    const leadWhere = {
      brandId: 5,
      isMdd: true,
      isResource: true,
      sessionCreatedAt: { gte: winStart, lt: winEndEx },
    };
    const [totalLeads, provinces, productLines, months] = await Promise.all([
      this.prisma.laiguLead.count({ where: leadWhere }),
      this.prisma.mddChannelSale.findMany({
        where: { brandId: 5 },
        select: { province: true },
        distinct: ['province'],
      }),
      this.prisma.mddChannelSale.findMany({
        where: { brandId: 5 },
        select: { productLine: true },
        distinct: ['productLine'],
      }),
      this.prisma.mddChannelSale.findMany({
        where: { brandId: 5 },
        select: { month: true },
        distinct: ['month'],
      }),
    ]);

    const totalSales = useOrders ? orderQty : rows.reduce((a, r) => a + n(r.quantity), 0);
    const conversion = totalLeads ? Math.round((totalSales / totalLeads) * 1000) / 10 : 0;

    // 月度 × 品系趋势（TOP8 品系按总量）
    const byProduct = new Map<string, number>();
    for (const r of rows) byProduct.set(r.productLine, (byProduct.get(r.productLine) ?? 0) + n(r.quantity));
    const topProducts = [...byProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p]) => p);
    const monthList = [...new Set(rows.map((r) => r.month))].sort();
    const trend = monthList.map((m) => {
      const point: Record<string, unknown> = { month: m };
      for (const p of topProducts) {
        point[p] = rows
          .filter((r) => r.month === m && r.productLine === p)
          .reduce((a, r) => a + n(r.quantity), 0);
      }
      return point;
    });

    const ranking = [...byProduct.entries()]
      .map(([productLine, qty]) => ({ product_line: productLine, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity);

    // 订单品名销量排行（按订单明细 productName，前 20）
    const byName = new Map<string, number>();
    for (const r of orderRows) {
      const name = (r.productName ?? '').trim();
      if (!name) continue;
      byName.set(name, (byName.get(name) ?? 0) + n(r.quantity));
    }
    const orderRanking = [...byName.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);

    // 日度趋势（订单按 date 求销量/销售额；月度汇总数据无日维度时不返回，前端回退月度）
    const dailyMap = new Map<string, { qty: number; amount: number }>();
    for (const r of orderRows) {
      if (!r.date) continue;
      const key = new Date(r.date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      const cur = dailyMap.get(key) ?? { qty: 0, amount: 0 };
      cur.qty += n(r.quantity);
      cur.amount += Number(r.amount ?? 0);
      dailyMap.set(key, cur);
    }
    const dailyTrend = [...dailyMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, qty: v.qty, amount: Math.round(v.amount * 100) / 100 }));

    // 门店明细（矩阵：门店 × 品系）
    const byStore = new Map<
      string,
      { store: string; province: string | null; total: number; byProduct: Map<string, number> }
    >();
    for (const r of rows) {
      const cur =
        byStore.get(r.storeName) ??
        { store: r.storeName, province: r.province, total: 0, byProduct: new Map() };
      cur.total += n(r.quantity);
      cur.byProduct.set(r.productLine, (cur.byProduct.get(r.productLine) ?? 0) + n(r.quantity));
      byStore.set(r.storeName, cur);
    }
    const detail = [...byStore.values()]
      .map((s) => {
        const row: Record<string, unknown> = {
          store: s.store,
          province: s.province,
          total: s.total,
        };
        for (const p of topProducts) row[p] = s.byProduct.get(p) ?? 0;
        return row;
      })
      .sort((a, b) => (b.total as number) - (a.total as number));

    return {
      start_month: startMonth,
      end_month: endMonth,
      cards: {
        total_leads: totalLeads,
        total_sales: totalSales,
        conversion_rate: conversion,
        scope_note: useOrders
          ? `销量=订单明细（${orderRows.length} 单/${orderQty} 台/¥${orderAmount.toLocaleString()}）；线索=来鼓留资会话；转化率=销量÷线索`
          : '销量=MDD 提供的小红书渠道销售清单；线索=来鼓留资会话（账户维度，随月份联动）；转化率=销量÷线索',
      },
      order_summary: {
        orders: orderRows.length,
        qty: orderQty,
        amount: orderAmount,
        customers: phoneSet.size,
        repurchase_rate: phoneSet.size
          ? Math.round(([...repurchasePhones].length / phoneSet.size) * 1000) / 10
          : 0,
      },
      staff_ranking: [...staffRankingMap.values()].sort((a, b) => b.qty - a.qty),
      trend,
      daily_trend: dailyTrend,
      ranking,
      order_ranking: orderRanking,
      detail,
      facets: {
        provinces: provinces.map((x) => x.province).filter(Boolean),
        product_lines: productLines.map((x) => x.productLine).filter(Boolean),
        months: months.map((x) => x.month).sort(),
      },
      empty_hint: rows.length || orderRows.length
        ? null
        : '暂无销售数据：请通过「导入数据」上传 9月dada小红书销售明细汇总.xlsx（订单明细）或月度汇总清单',
    };
  }

  // ───────────────────────── 成交选题雷达（品类洞察） ─────────────────────────

  /** 月份平移：'2026-09' -1 → '2026-08' */
  private shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  }

  /** 月份闭区间列表 */
  private monthRange(start: string, end: string): string[] {
    const out: string[] = [];
    let cur = start;
    while (cur <= end && out.length < 36) {
      out.push(cur);
      cur = this.shiftMonth(cur, 1);
    }
    return out;
  }

  private median(values: number[]): number {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  /**
   * 品类洞察（成交选题雷达主接口）：成交（订单）× 留资（潜在成交，笔记日维度）× 内容供给交叉分析。
   * 象限按成交/留资双口径分别计算；建议为规则启发式（每周篇数=篇均销量分档）。
   */
  @Get('category-insight')
  async categoryInsight(
    @Query() query: { startMonth?: string; endMonth?: string },
  ) {
    const today = monthKey(new Date());
    const endMonth = /^\d{4}-\d{2}$/.test(query.endMonth ?? '') ? (query.endMonth as string) : today;
    const startMonth = /^\d{4}-\d{2}$/.test(query.startMonth ?? '')
      ? (query.startMonth as string)
      : this.shiftMonth(endMonth, -2);
    const months = this.monthRange(startMonth, endMonth);
    const monthCount = Math.max(months.length, 1);
    const weeks = Math.max((monthCount * 30) / 7, 1);

    // 上一个等长窗口（环比）
    const prevEndMonth = this.shiftMonth(startMonth, -1);
    const prevStartMonth = this.shiftMonth(prevEndMonth, -(monthCount - 1));

    const winStart = new Date(`${startMonth}-01T00:00:00+08:00`);
    const winEndEx = new Date(new Date(`${endMonth}-01T00:00:00+08:00`).getTime() + 31 * 86400000);
    const prevWinStart = new Date(`${prevStartMonth}-01T00:00:00+08:00`);
    const prevWinEndEx = new Date(`${startMonth}-01T00:00:00+08:00`);

    // 1. 订单（成交）：当前 + 上一窗口
    const orderWhere = { brandId: 5, month: { gte: startMonth, lte: endMonth } };
    const [orderRows, prevOrderRows, legacyUncategorized] = await Promise.all([
      this.prisma.mddSalesOrder.findMany({
        where: orderWhere,
        select: { month: true, category: true, productName: true, quantity: true, amount: true, phone: true, repurchase: true },
      }),
      this.prisma.mddSalesOrder.findMany({
        where: { brandId: 5, month: { gte: prevStartMonth, lte: prevEndMonth } },
        select: { category: true, quantity: true },
      }),
      this.prisma.mddSalesOrder.count({ where: { brandId: 5, category: null } }),
    ]);

    // 2. 笔记日维度（留资/表现，窗口求和；含上一窗口算环比）
    const [statRows, prevStatRows] = await Promise.all([
      this.prisma.koxNoteDailyStat.findMany({
        where: { brandId: 5, day: { gte: winStart, lt: winEndEx } },
        select: { noteId: true, exposure: true, views: true, likes: true, collects: true, comments: true, shares: true, pmOpenings: true, pmLeads: true, formLeads: true },
      }),
      this.prisma.koxNoteDailyStat.findMany({
        where: { brandId: 5, day: { gte: prevWinStart, lt: prevWinEndEx } },
        select: { noteId: true, pmLeads: true, formLeads: true },
      }),
    ]);

    // 3. 笔记主表（供给=窗口内发布；标题→品类归类）
    const rules = await this.mddCategory.loadRulesPublic();
    const [publishedNotes, activeNoteIds] = await Promise.all([
      this.prisma.koxNote.findMany({
        where: { brandId: 5, publishTime: { gte: winStart, lt: winEndEx } },
        select: { noteId: true, title: true, noteUrl: true, authorName: true, publishTime: true },
      }),
      Promise.resolve([...new Set(statRows.map((s) => s.noteId))]),
    ]);
    const noteMeta = new Map<string, { title: string; url: string | null; author: string | null; category: string }>();
    const metaRows = await this.prisma.koxNote.findMany({
      where: { brandId: 5, noteId: { in: [...new Set([...activeNoteIds, ...publishedNotes.map((p2) => p2.noteId)])] } },
      select: { noteId: true, title: true, noteUrl: true, authorName: true },
    });
    for (const nt of metaRows) {
      noteMeta.set(nt.noteId, {
        title: nt.title ?? '',
        url: nt.noteUrl ?? null,
        author: nt.authorName ?? null,
        category: classifyByRules(nt.title, rules),
      });
    }
    for (const p2 of publishedNotes) {
      if (!noteMeta.has(p2.noteId)) {
        noteMeta.set(p2.noteId, {
          title: p2.title ?? '',
          url: p2.noteUrl ?? null,
          author: p2.authorName ?? null,
          category: classifyByRules(p2.title, rules),
        });
      }
    }

    // 4. 品类维度聚合
    const defs = await this.prisma.mddCategoryDef.findMany({
      where: { brandId: 5, enabled: true },
      orderBy: { sort: 'asc' },
    });
    const catOrder: string[] = defs.map((d) => d.name);
    const catSet = new Set(catOrder);

    interface CatAgg {
      category: string;
      qty: number; amount: number; orders: number; customers: number; repurchaseRate: number;
      qtyPrev: number;
      leads: number; leadsPrev: number; pmOpenings: number; engagement: number; exposure: number; views: number;
      notesPublished: number; notesActive: number;
    }
    const aggOf = (c: string): CatAgg => ({
      category: c, qty: 0, amount: 0, orders: 0, customers: 0, repurchaseRate: 0, qtyPrev: 0,
      leads: 0, leadsPrev: 0, pmOpenings: 0, engagement: 0, exposure: 0, views: 0,
      notesPublished: 0, notesActive: 0,
    });
    const agg = new Map<string, CatAgg>();
    const ensure = (c: string) => {
      if (c === '未归类') return null;
      if (!catSet.has(c)) { catSet.add(c); catOrder.push(c); }
      if (!agg.has(c)) agg.set(c, aggOf(c));
      return agg.get(c) as CatAgg;
    };

    const unclassifiedMap = new Map<string, { name: string; qty: number; orders: number }>();
    for (const r of orderRows) {
      const cat = r.category ?? '未归类';
      if (cat === '未归类') {
        const name = (r.productName ?? '').trim() || '(空品名)';
        const u = unclassifiedMap.get(name) ?? { name, qty: 0, orders: 0 };
        u.qty += n(r.quantity);
        u.orders += 1;
        unclassifiedMap.set(name, u);
        continue;
      }
      const a = ensure(cat) as CatAgg;
      a.qty += n(r.quantity);
      a.amount += Number(r.amount ?? 0);
      a.orders += 1;
    }
    // 客户数/复购率按品类重扫一遍（phone 集合）
    const phonesByCat = new Map<string, Set<string>>();
    const repurchaseByCat = new Map<string, Set<string>>();
    for (const r of orderRows) {
      const cat = r.category ?? '未归类';
      if (cat === '未归类' || !r.phone) continue;
      if (!phonesByCat.has(cat)) { phonesByCat.set(cat, new Set()); repurchaseByCat.set(cat, new Set()); }
      phonesByCat.get(cat)?.add(r.phone);
      if (r.repurchase === '是') repurchaseByCat.get(cat)?.add(r.phone);
    }
    for (const r of prevOrderRows) {
      const cat = r.category ?? '未归类';
      if (cat === '未归类') continue;
      const a = ensure(cat) as CatAgg;
      a.qtyPrev += n(r.quantity);
    }
    // 活跃笔记按品类聚合表现
    const activeByCat = new Map<string, Set<string>>();
    for (const s of statRows) {
      const meta = noteMeta.get(s.noteId);
      const cat = meta?.category ?? '未归类';
      if (cat === '未归类') continue;
      const a = ensure(cat) as CatAgg;
      a.leads += s.pmLeads + s.formLeads;
      a.pmOpenings += s.pmOpenings;
      a.engagement += s.likes + s.collects + s.comments + s.shares;
      a.exposure += s.exposure;
      a.views += s.views;
      if (!activeByCat.has(cat)) activeByCat.set(cat, new Set());
      activeByCat.get(cat)?.add(s.noteId);
    }
    for (const [cat, set] of activeByCat) {
      const a = agg.get(cat);
      if (a) a.notesActive = set.size;
    }
    for (const p2 of publishedNotes) {
      const meta = noteMeta.get(p2.noteId);
      const cat = meta?.category ?? '未归类';
      if (cat === '未归类') continue;
      (ensure(cat) as CatAgg).notesPublished += 1;
    }
    for (const s of prevStatRows) {
      const meta = noteMeta.get(s.noteId);
      const cat = meta?.category ?? '未归类';
      if (cat === '未归类') continue;
      (ensure(cat) as CatAgg).leadsPrev += s.pmLeads + s.formLeads;
    }

    const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
    const summary = catOrder
      .filter((c) => agg.has(c) || catSet.has(c))
      .map((c) => {
        const a = (agg.get(c) as CatAgg) ?? aggOf(c);
        return {
          category: c,
          qty: a.qty,
          qty_wow: pct(a.qty, a.qtyPrev),
          amount: Math.round(a.amount * 100) / 100,
          orders: a.orders,
          customers: phonesByCat.get(c)?.size ?? 0,
          repurchase_rate: (() => {
            const ph = phonesByCat.get(c)?.size ?? 0;
            return ph ? Math.round(((repurchaseByCat.get(c)?.size ?? 0) / ph) * 1000) / 10 : 0;
          })(),
          leads: a.leads,
          leads_wow: pct(a.leads, a.leadsPrev),
          leads_per_note: a.notesActive ? Math.round((a.leads / a.notesActive) * 100) / 100 : 0,
          leads_to_sales_rate: a.leads ? Math.round((a.qty / a.leads) * 100) / 10 : null,
          notes_published: a.notesPublished,
          notes_per_week: Math.round((a.notesPublished / weeks) * 100) / 100,
          notes_active: a.notesActive,
          engagement: a.engagement,
          exposure: a.exposure,
          views: a.views,
          pm_openings: a.pmOpenings,
        };
      });

    // 5. 四象限（成交/留资双口径；中位数切分；合计占比 <2% 归长尾）
    const hasData = summary.filter((s) => s.qty > 0 || s.leads > 0 || s.notes_published > 0);
    const totalQty = hasData.reduce((a, s) => a + s.qty, 0);
    const totalLeads = hasData.reduce((a, s) => a + s.leads, 0);
    const medQty = this.median(hasData.map((s) => s.qty));
    const medLeads = this.median(hasData.map((s) => s.leads));
    const medNotes = this.median(hasData.map((s) => s.notes_published));
    const quadrantOf = (v: number, med: number) => (v > 0 && v >= med ? '高' : '低');
    const matrix = hasData.map((s) => {
      const longTail =
        totalQty > 0 && s.qty < totalQty * 0.02 && (totalLeads === 0 || s.leads < totalLeads * 0.02);
      const qSales = longTail ? '长尾' : quadrantOf(s.qty, medQty);
      const qLeads = longTail ? '长尾' : quadrantOf(s.leads, medLeads);
      return {
        category: s.category,
        qty: s.qty,
        amount: s.amount,
        leads: s.leads,
        notes_published: s.notes_published,
        quadrant_sales: qSales,
        quadrant_leads: qLeads,
        supply_low: s.notes_published < medNotes,
      };
    });

    // 6. 参考爆文：每品类 留资→互动 排序 TOP5
    const noteAgg = new Map<string, NoteAgg>();
    for (const s of statRows) {
      const meta = noteMeta.get(s.noteId);
      if (!meta || meta.category === '未归类') continue;
      const cur = noteAgg.get(s.noteId) ?? {
        noteId: s.noteId, title: meta.title, url: meta.url, author: meta.author, category: meta.category,
        views: 0, engagement: 0, pmOpenings: 0, leads: 0,
      };
      cur.views += s.views;
      cur.engagement += s.likes + s.collects + s.comments + s.shares;
      cur.pmOpenings += s.pmOpenings;
      cur.leads += s.pmLeads + s.formLeads;
      noteAgg.set(s.noteId, cur);
    }
    const byCatNotes = new Map<string, NoteAgg[]>();
    for (const nt of noteAgg.values()) {
      if (!byCatNotes.has(nt.category)) byCatNotes.set(nt.category, []);
      byCatNotes.get(nt.category)?.push(nt);
    }
    for (const [cat, list] of byCatNotes) {
      byCatNotes.set(
        cat,
        list.sort((a, b) => (b.leads - a.leads) || (b.engagement - a.engagement)).slice(0, 5),
      );
    }

    // 7. 内容类型效率（8 类内容轴，回答「怎么写」）
    const typeAgg = new Map<string, { notes: Set<string>; views: number; engagement: number; pmOpenings: number; leads: number }>();
    for (const s of statRows) {
      const meta = noteMeta.get(s.noteId);
      const t = mddCategoryOf(meta?.title ?? '');
      const cur = typeAgg.get(t) ?? { notes: new Set<string>(), views: 0, engagement: 0, pmOpenings: 0, leads: 0 };
      cur.notes.add(s.noteId);
      cur.views += s.views;
      cur.engagement += s.likes + s.collects + s.comments + s.shares;
      cur.pmOpenings += s.pmOpenings;
      cur.leads += s.pmLeads + s.formLeads;
      typeAgg.set(t, cur);
    }
    const contentTypeEfficiency = MDD_CATEGORY_LIST.map((t) => {
      const a = typeAgg.get(t);
      return {
        type: t,
        notes: a?.notes.size ?? 0,
        views: a?.views ?? 0,
        engagement: a?.engagement ?? 0,
        pm_openings: a?.pmOpenings ?? 0,
        leads: a?.leads ?? 0,
      };
    });

    // 8. 选题建议（每品类取优先级最高一条：成交缺口 > 留资缺口 > 留资不转化 > 成交缺留资）
    const suggestions: {
      type: string; category: string; title: string; reason: string; action: string;
      weekly_target: number | null; ref_notes: NoteAgg[];
    }[] = [];
    const sup = new Map(summary.map((s) => [s.category, s]));
    for (const m of matrix) {
      const s = sup.get(m.category) as (typeof summary)[number] | undefined;
      if (!s) continue;
      const refs = byCatNotes.get(m.category) ?? [];
      const gapRatio = m.qty / Math.max(m.notes_published, 1);
      const weeklyTarget = gapRatio >= 8 ? 3 : gapRatio >= 3 ? 2 : 1;
      if (m.quadrant_sales === '高' && m.supply_low) {
        suggestions.push({
          type: 'supply_gap_sales', category: m.category,
          title: `「${m.category}」成交热但内容供给不足`,
          reason: `窗口内成交 ${s.qty} 件/¥${s.amount.toLocaleString()}，仅发布 ${s.notes_published} 篇（篇均 ${Math.round(gapRatio * 10) / 10} 件）`,
          action: `建议每周补充 ${weeklyTarget} 篇该品类内容，优先复刻下方参考爆文结构`,
          weekly_target: weeklyTarget, ref_notes: refs.slice(0, 3),
        });
      } else if (m.quadrant_leads === '高' && m.supply_low) {
        suggestions.push({
          type: 'supply_gap_leads', category: m.category,
          title: `「${m.category}」留资热但内容跟不上`,
          reason: `窗口内留资 ${s.leads} 条（篇均 ${s.leads_per_note}），仅发布 ${s.notes_published} 篇`,
          action: `种草需求已验证，建议每周补充 ${weeklyTarget} 篇承接搜索与私信兴趣`,
          weekly_target: weeklyTarget, ref_notes: refs.slice(0, 3),
        });
      } else if (m.quadrant_leads === '高' && m.quadrant_sales !== '高' && m.quadrant_sales !== '长尾') {
        suggestions.push({
          type: 'leads_no_conversion', category: m.category,
          title: `「${m.category}」留资多但成交转化弱`,
          reason: `留资 ${s.leads} 条 vs 成交 ${s.qty} 件（留资→成交 ${s.leads_to_sales_rate ?? 0}%）`,
          action: '保持供给频次，优先排查私信承接话术与选品价格，转化恢复后再加供给',
          weekly_target: null, ref_notes: refs.slice(0, 3),
        });
      } else if (m.quadrant_sales === '高' && m.quadrant_leads !== '高' && m.quadrant_leads !== '长尾') {
        suggestions.push({
          type: 'sales_low_leads', category: m.category,
          title: `「${m.category}」成交好但内容拉新不足`,
          reason: `成交 ${s.qty} 件但留资仅 ${s.leads} 条，复购/老客驱动特征明显`,
          action: '内容侧重拉新场景与私信引导，扩大新客来源',
          weekly_target: null, ref_notes: refs.slice(0, 3),
        });
      }
    }
    const typePriority: Record<string, number> = { supply_gap_sales: 0, supply_gap_leads: 1, leads_no_conversion: 2, sales_low_leads: 3 };
    suggestions.sort((a, b) => (typePriority[a.type] - typePriority[b.type]) || ((sup.get(b.category)?.qty ?? 0) - (sup.get(a.category)?.qty ?? 0)));

    // 9. 汇总卡
    const totalAmount = orderRows.reduce((a, r) => a + Number(r.amount ?? 0), 0);
    const allPhones = new Set(orderRows.map((r) => r.phone).filter(Boolean));
    const allRepurchase = new Set(orderRows.filter((r) => r.repurchase === '是').map((r) => r.phone).filter(Boolean));
    const totalLeadsPrev = prevStatRows.reduce((a, s) => a + s.pmLeads + s.formLeads, 0);
    const totalQtyPrev = prevOrderRows.reduce((a, r) => a + n(r.quantity), 0);

    return {
      start_month: startMonth,
      end_month: endMonth,
      months,
      cards: {
        total_qty: orderRows.reduce((a, r) => a + n(r.quantity), 0),
        total_amount: Math.round(totalAmount * 100) / 100,
        total_orders: orderRows.length,
        customers: allPhones.size,
        repurchase_rate: allPhones.size ? Math.round(([...allRepurchase].length / allPhones.size) * 1000) / 10 : 0,
        total_leads: statRows.reduce((a, s) => a + s.pmLeads + s.formLeads, 0),
        supply_notes: publishedNotes.length,
        qty_wow: pct(orderRows.reduce((a, r) => a + n(r.quantity), 0), totalQtyPrev),
        leads_wow: pct(statRows.reduce((a, s) => a + s.pmLeads + s.formLeads, 0), totalLeadsPrev),
      },
      category_summary: summary,
      matrix,
      content_type_efficiency: contentTypeEfficiency,
      top_notes: [...byCatNotes.entries()].map(([category, list]) => ({ category, notes: list })),
      suggestions,
      unclassified: [...unclassifiedMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 20),
      facets: { months },
      scope_note: {
        sales: '成交=订单明细（客户底表），品类由品名关键词规则（MddCategoryRule）归类，未命中计入「未归类」',
        leads: '留资=潜在成交，取笔记日维度私信留资(pmLeads)+表单留资(formLeads)窗口求和；与线索中心获客工具统计口径存在差异',
        cross: '留资→成交转化率为跨口径参考值（订单 vs 笔记不同源），仅作方向判断',
        supply: `供给=窗口内发布笔记且标题命中品类（约 25% 命中率）；表现指标为窗口内日维度之和（含老笔记长尾）`,
        quadrant: '象限按成交/留资分别以品类中位数切分；合计占比<2% 归「长尾」；建议为规则启发式（篇均销量分档建议每周篇数）',
        legacy: legacyUncategorized > 0 ? `存在 ${legacyUncategorized} 条历史订单品类为空，可在「口径维护」一键重算` : null,
      },
    };
  }

  /** 品类口径：定义 + 规则列表（口径维护 tab） */
  @Get('categories')
  async categories() {
    const [defs, rules] = await Promise.all([
      this.prisma.mddCategoryDef.findMany({ where: { brandId: 5 }, orderBy: { sort: 'asc' } }),
      this.prisma.mddCategoryRule.findMany({ where: { brandId: 5 }, orderBy: { priority: 'asc' } }),
    ]);
    return { defs, rules };
  }

  @Post('categories/defs')
  async createCategoryDef(@Body() dto: { name?: string; sort?: number | string; remark?: string }) {
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException('品类名不能为空');
    const def = await this.prisma.mddCategoryDef.upsert({
      where: { brandId_name: { brandId: 5, name } },
      create: { brandId: 5, name, sort: Number(dto.sort ?? 99) || 99, remark: dto.remark ? String(dto.remark) : null },
      update: { enabled: true },
    });
    this.mddCategory.invalidate();
    return def;
  }

  @Patch('categories/defs/:id')
  async updateCategoryDef(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { sort?: number | string; enabled?: boolean; remark?: string },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.sort != null) data.sort = Number(dto.sort) || 0;
    if (dto.enabled != null) data.enabled = dto.enabled;
    if (dto.remark != null) data.remark = String(dto.remark);
    const def = await this.prisma.mddCategoryDef.update({ where: { id }, data });
    this.mddCategory.invalidate();
    return def;
  }

  @Post('categories/rules')
  async createCategoryRule(
    @Body() dto: { pattern?: string; matchType?: string; category?: string; priority?: number | string; remark?: string },
  ) {
    const pattern = String(dto.pattern ?? '').trim();
    const category = String(dto.category ?? '').trim();
    if (!pattern) throw new BadRequestException('关键词不能为空');
    if (!category) throw new BadRequestException('目标品类不能为空');
    const rule = await this.prisma.mddCategoryRule.create({
      data: {
        brandId: 5,
        pattern,
        matchType: dto.matchType === 'exact' ? 'exact' : 'contains',
        category,
        priority: Number(dto.priority ?? 100) || 100,
        remark: dto.remark ? String(dto.remark) : null,
      },
    });
    this.mddCategory.invalidate();
    return rule;
  }

  @Patch('categories/rules/:id')
  async updateCategoryRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { pattern?: string; matchType?: string; category?: string; priority?: number | string; enabled?: boolean; remark?: string },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.pattern != null) data.pattern = String(dto.pattern).trim();
    if (dto.matchType != null) data.matchType = dto.matchType === 'exact' ? 'exact' : 'contains';
    if (dto.category != null) data.category = String(dto.category).trim();
    if (dto.priority != null) data.priority = Number(dto.priority) || 100;
    if (dto.enabled != null) data.enabled = dto.enabled;
    if (dto.remark != null) data.remark = String(dto.remark);
    const rule = await this.prisma.mddCategoryRule.update({ where: { id }, data });
    this.mddCategory.invalidate();
    return rule;
  }

  @Delete('categories/rules/:id')
  async deleteCategoryRule(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.mddCategoryRule.delete({ where: { id } });
    this.mddCategory.invalidate();
    return { ok: true };
  }

  /** 按当前规则重算全部存量订单品类（规则维护后一键回填） */
  @Post('categories/reclassify')
  async reclassifyOrders() {
    const res = await this.mddCategory.reclassifyOrders();
    this.mddCategory.invalidate();
    return res;
  }
}
