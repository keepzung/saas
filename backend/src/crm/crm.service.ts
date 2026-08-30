import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerLevel, FollowStatus, PayStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const LEVELS = Object.values(CustomerLevel);
const FOLLOW_STATUSES = Object.values(FollowStatus);
const PAY_STATUSES = Object.values(PayStatus);

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  async customers(query: {
    page?: string;
    page_size?: string;
    keyword?: string;
    level?: string;
    followStatus?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 10) || 10);
    const where: Prisma.CustomerWhereInput = {};
    if (query.level && LEVELS.includes(query.level as CustomerLevel)) {
      where.level = query.level as CustomerLevel;
    }
    if (
      query.followStatus &&
      FOLLOW_STATUSES.includes(query.followStatus as FollowStatus)
    ) {
      where.followStatus = query.followStatus as FollowStatus;
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword } },
        { company: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { orders: true } },
          orders: { select: { amount: true } },
        },
      }),
    ]);
    return {
      list: rows.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        company: c.company,
        level: c.level,
        follow_status: c.followStatus,
        remark: c.remark,
        order_count: c._count.orders,
        total_amount: c.orders.reduce(
          (acc, o) => acc + Number(o.amount),
          0,
        ),
        created_at: c.createdAt,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  async createCustomer(
    dto: {
      name: string;
      phone: string;
      company?: string;
      level?: string;
      followStatus?: string;
      remark?: string;
    },
    userId: number,
  ) {
    if (!dto.name?.trim() || !dto.phone?.trim()) {
      throw new BadRequestException('客户名称与联系电话必填');
    }
    const exists = await this.prisma.customer.findFirst({
      where: { phone: dto.phone },
    });
    if (exists) throw new BadRequestException('该手机号已存在客户');
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        company: dto.company,
        level:
          dto.level && LEVELS.includes(dto.level as CustomerLevel)
            ? (dto.level as CustomerLevel)
            : CustomerLevel.NORMAL,
        followStatus:
          dto.followStatus &&
          FOLLOW_STATUSES.includes(dto.followStatus as FollowStatus)
            ? (dto.followStatus as FollowStatus)
            : FollowStatus.UNCONTACTED,
        remark: dto.remark,
        createdById: userId,
      },
    });
    return { id: customer.id };
  }

  async updateCustomer(
    id: number,
    dto: {
      name?: string;
      phone?: string;
      company?: string;
      level?: string;
      followStatus?: string;
      remark?: string;
    },
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (dto.phone && dto.phone !== customer.phone) {
      const exists = await this.prisma.customer.findFirst({
        where: { phone: dto.phone },
      });
      if (exists) throw new BadRequestException('该手机号已存在客户');
    }
    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.level !== undefined &&
        LEVELS.includes(dto.level as CustomerLevel)
          ? { level: dto.level as CustomerLevel }
          : {}),
        ...(dto.followStatus !== undefined &&
        FOLLOW_STATUSES.includes(dto.followStatus as FollowStatus)
          ? { followStatus: dto.followStatus as FollowStatus }
          : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      },
    });
    return { id };
  }

  async deleteCustomer(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    if (customer._count.orders > 0) {
      throw new BadRequestException('该客户存在关联订单，无法删除');
    }
    await this.prisma.customer.delete({ where: { id } });
    return { id };
  }

  async orders(query: {
    page?: string;
    page_size?: string;
    keyword?: string;
    payStatus?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Number(query.page_size ?? 10) || 10);
    const where: Prisma.OrderWhereInput = {};
    if (
      query.payStatus &&
      PAY_STATUSES.includes(query.payStatus as PayStatus)
    ) {
      where.payStatus = query.payStatus as PayStatus;
    }
    if (query.keyword) {
      where.OR = [
        { orderNo: { contains: query.keyword } },
        { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
      ];
    }
    const [total, rows, sumAgg] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { orderedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { name: true, phone: true } },
          createdBy: { select: { nickname: true, name: true } },
        },
      }),
      this.prisma.order.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);
    return {
      list: rows.map((o) => ({
        id: o.id,
        order_no: o.orderNo,
        customer_id: o.customerId,
        customer_name: o.customer.name,
        customer_phone: o.customer.phone,
        amount: Number(o.amount),
        pay_status: o.payStatus,
        ordered_at: o.orderedAt,
        created_by: o.createdBy?.nickname ?? o.createdBy?.name ?? '-',
      })),
      total,
      page,
      page_size: pageSize,
      total_amount: Number(sumAgg._sum.amount ?? 0),
    };
  }

  async createOrder(
    dto: {
      customerId: number;
      amount: number;
      payStatus?: string;
      orderedAt?: string;
    },
    userId: number,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!(dto.amount > 0)) throw new BadRequestException('订单金额需大于 0');
    const order = await this.prisma.order.create({
      data: {
        orderNo: `SO${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
        customerId: dto.customerId,
        amount: dto.amount,
        payStatus:
          dto.payStatus && PAY_STATUSES.includes(dto.payStatus as PayStatus)
            ? (dto.payStatus as PayStatus)
            : PayStatus.PENDING,
        orderedAt: dto.orderedAt ? new Date(dto.orderedAt) : new Date(),
        createdById: userId,
      },
    });
    return { id: order.id, order_no: order.orderNo };
  }

  async updateOrderPayStatus(id: number, payStatus: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (!PAY_STATUSES.includes(payStatus as PayStatus)) {
      throw new BadRequestException('无效的支付状态');
    }
    await this.prisma.order.update({
      where: { id },
      data: { payStatus: payStatus as PayStatus },
    });
    return { id, pay_status: payStatus };
  }

  async deleteOrder(id: number) {
    await this.prisma.order.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('订单不存在');
    });
    return { id };
  }
}
