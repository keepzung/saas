import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

@Controller('mdd/sales')
@UseGuards(JwtAuthGuard)
export class MddSalesController {
  constructor(private readonly prisma: PrismaService) {}

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

    const totalSales = rows.reduce((a, r) => a + n(r.quantity), 0);
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
        scope_note:
          '线索=来鼓留资会话（账户维度，随月份联动）；销量=MDD 提供的小红书渠道销售清单；转化率=销量÷线索',
      },
      trend,
      ranking,
      detail,
      facets: {
        provinces: provinces.map((x) => x.province).filter(Boolean),
        product_lines: productLines.map((x) => x.productLine).filter(Boolean),
        months: months.map((x) => x.month).sort(),
      },
      empty_hint: rows.length
        ? null
        : '暂无销售数据：请通过「导入数据」上传 MDD 小红书渠道销售清单（月份/门店/省份/品系/销量）',
    };
  }
}
