// MDD(5) 成交品类归类：品名/笔记标题 → 品类
// 规则存 MddCategoryRule（priority 升序首中命中，contains/exact 两种匹配），
// 未命中或空文本 = 未归类；规则缓存 60s，规则维护接口写入后主动失效
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const MDD_BRAND_ID = 5;
export const MDD_CATEGORY_UNCLASSIFIED = '未归类';

export interface CategoryRuleLite {
  pattern: string;
  matchType: string; // contains | exact
  category: string;
  priority: number;
}

/** 纯函数归类（方便脚本/服务两端复用；rules 须已按 priority 升序） */
export function classifyByRules(text: string | null | undefined, rules: CategoryRuleLite[]): string {
  const s = String(text ?? '').trim();
  if (!s) return MDD_CATEGORY_UNCLASSIFIED;
  const lower = s.toLowerCase();
  for (const r of rules) {
    if (!r.pattern) continue;
    if (r.matchType === 'exact') {
      if (s === r.pattern) return r.category;
    } else if (lower.includes(r.pattern.toLowerCase())) {
      return r.category;
    }
  }
  return MDD_CATEGORY_UNCLASSIFIED;
}

@Injectable()
export class MddCategoryService {
  private rules: CategoryRuleLite[] | null = null;
  private loadedAt = 0;
  private static CACHE_MS = 60_000;

  constructor(private prisma: PrismaService) {}

  private async loadRules(): Promise<CategoryRuleLite[]> {
    if (!this.rules || Date.now() - this.loadedAt > MddCategoryService.CACHE_MS) {
      const rows = await this.prisma.mddCategoryRule.findMany({
        where: { brandId: MDD_BRAND_ID, enabled: true },
        orderBy: { priority: 'asc' },
      });
      this.rules = rows.map((r) => ({ pattern: r.pattern, matchType: r.matchType, category: r.category, priority: r.priority }));
      this.loadedAt = Date.now();
    }
    return this.rules;
  }

  /** 规则维护（增删改/启停）后调用，立即生效 */
  invalidate() {
    this.rules = null;
  }

  async classify(text: string | null | undefined): Promise<string> {
    return classifyByRules(text, await this.loadRules());
  }

  async loadRulesPublic(): Promise<CategoryRuleLite[]> {
    return this.loadRules();
  }

  /** 存量订单按当前规则重算 category（幂等；返回改动条数） */
  async reclassifyOrders(): Promise<{ total: number; changed: number }> {
    const rules = await this.loadRules();
    const orders = await this.prisma.mddSalesOrder.findMany({
      where: { brandId: MDD_BRAND_ID },
      select: { id: true, productName: true, category: true },
    });
    let changed = 0;
    for (const o of orders) {
      const next = classifyByRules(o.productName, rules);
      if (next !== (o.category ?? MDD_CATEGORY_UNCLASSIFIED)) {
        // 未归类仍落库为空串？——落库统一存「未归类」，聚合与筛选口径一致
        await this.prisma.mddSalesOrder.update({ where: { id: o.id }, data: { category: next } });
        changed += 1;
      }
    }
    return { total: orders.length, changed };
  }
}
