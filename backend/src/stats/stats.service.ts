import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [customers, vipCustomers, orders, todayOrders, pendingPayments] =
      await Promise.all([
        this.prisma.customer.count(),
        this.prisma.customer.count({ where: { level: 'VIP' } }),
        this.prisma.order.count(),
        this.prisma.order.count({
          where: { orderedAt: { gte: startOfDay } },
        }),
        this.prisma.order.count({ where: { payStatus: 'PENDING' } }),
      ]);

    return { customers, vipCustomers, orders, todayOrders, pendingPayments };
  }
}
