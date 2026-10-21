import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

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

@Controller('mdd/sales')
@UseGuards(JwtAuthGuard)
export class MddSalesController {
  constructor(private readonly prisma: PrismaService) {}

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
}
