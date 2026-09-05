import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto, UpdateCustomerCreditDto, CustomerFilterDto } from './dto';
import { paginate } from '../../common';

// Sunday-start weekday order, matching the convention used elsewhere in this app (see
// pos-dashboard.service.ts) — Postgres EXTRACT(DOW ...) returns 0=Sunday..6=Saturday.
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, filter: CustomerFilterDto) {
    const { page = 1, limit = 20, search } = filter;
    const skip = (page - 1) * limit;

    const where: any = { organizationId, isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isActive: true,
          walletBalance: true,
          creditLimit: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(customers, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            total: true,
            source: true,
            createdAt: true,
            closedAt: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async getStats(id: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: { id: true, walletBalance: true, createdAt: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Scoped the same way pos-dashboard.service.ts scopes its org-wide equivalents: closed
    // orders only, keyed off closedAt — a customer's "lifetime" stats shouldn't include an
    // order that's still open or was cancelled.
    const closedOrderFilter = {
      organizationId,
      customerId: id,
      status: { in: [OrderStatus.CLOSED_PAID, OrderStatus.CLOSED_UNPAID] },
    };

    const [sales, orderAgg, lastOrder, bySource, topMeals, topDrinks, byWeekday] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { organizationId, orderId: { not: null }, order: closedOrderFilter },
        _sum: { amount: true },
      }),
      this.prisma.order.aggregate({
        where: closedOrderFilter,
        _count: true,
      }),
      this.prisma.order.findFirst({
        where: closedOrderFilter,
        orderBy: { closedAt: 'desc' },
        select: { closedAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['source'],
        where: closedOrderFilter,
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: 'desc' } },
      }),
      this.prisma.$queryRaw<{ id: string; name: string; quantity: number; revenue: number; orders: number }[]>`
        SELECT
          oi.menu_item_id as id,
          mi.name as name,
          SUM(oi.quantity)::numeric as quantity,
          SUM(oi.amount)::numeric as revenue,
          COUNT(DISTINCT oi.order_id)::integer as orders
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.organization_id = ${organizationId}
          AND o.customer_id = ${id}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
          AND EXISTS (
            SELECT 1 FROM menu_item_categories mic
            JOIN menu_categories mc ON mc.id = mic.category_id
            WHERE mic.menu_item_id = oi.menu_item_id AND mc.kind = 'FOOD'
          )
        GROUP BY oi.menu_item_id, mi.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
      this.prisma.$queryRaw<{ id: string; name: string; quantity: number; revenue: number; orders: number }[]>`
        SELECT
          oi.menu_item_id as id,
          mi.name as name,
          SUM(oi.quantity)::numeric as quantity,
          SUM(oi.amount)::numeric as revenue,
          COUNT(DISTINCT oi.order_id)::integer as orders
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.organization_id = ${organizationId}
          AND o.customer_id = ${id}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
          AND EXISTS (
            SELECT 1 FROM menu_item_categories mic
            JOIN menu_categories mc ON mc.id = mic.category_id
            WHERE mic.menu_item_id = oi.menu_item_id AND mc.kind = 'DRINK'
          )
        GROUP BY oi.menu_item_id, mi.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
      this.prisma.$queryRaw<{ dow: number; count: number }[]>`
        SELECT
          EXTRACT(DOW FROM o.closed_at)::integer as dow,
          COUNT(*)::integer as count
        FROM orders o
        WHERE o.organization_id = ${organizationId}
          AND o.customer_id = ${id}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
        GROUP BY dow
      `,
    ]);

    const weekdayCounts = WEEKDAY_LABELS.map((day, dow) => ({
      day,
      count: Number(byWeekday.find((w) => w.dow === dow)?.count ?? 0),
    }));

    return {
      lifetimeSales: Number(sales._sum.amount || 0),
      lifetimeOrders: orderAgg._count,
      lastVisit: lastOrder?.closedAt ?? null,
      customerSince: customer.createdAt,
      currentCredit: Math.max(0, -Number(customer.walletBalance)),
      byOrderType: bySource.map((s) => ({
        type: s.source,
        total: Number(s._sum.total || 0),
        count: s._count,
      })),
      topMeals: topMeals.map((m) => ({
        id: m.id,
        name: m.name,
        quantity: Number(m.quantity),
        revenue: Number(m.revenue),
        orders: Number(m.orders),
      })),
      topDrinks: topDrinks.map((m) => ({
        id: m.id,
        name: m.name,
        quantity: Number(m.quantity),
        revenue: Number(m.revenue),
        orders: Number(m.orders),
      })),
      visitsByWeekday: weekdayCounts,
    };
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({
        data: { organizationId, ...dto },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A customer with this phone number already exists');
      }
      throw error;
    }
  }

  async update(id: string, organizationId: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    try {
      return await this.prisma.customer.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A customer with this phone number already exists');
      }
      throw error;
    }
  }

  async updateCreditLimit(id: string, organizationId: string, dto: UpdateCustomerCreditDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { creditLimit: dto.creditLimit },
    });
  }

  async remove(id: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Always soft-delete: Order.customerId uses onDelete SetNull, so a hard
    // delete would silently strip the customer link off historical orders.
    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Customer deactivated' };
  }
}
