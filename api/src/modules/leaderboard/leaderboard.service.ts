import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { applyShiftHours, CurrentUserData, DEFAULT_SHIFT_HOURS, hasPermission } from '../../common';
import { buildLeaderboard, StaffTotals } from './leaderboard.builder';
import { LeaderboardSettings, readSettings } from './leaderboard.settings';
import { LeaderboardQueryDto, UpdateLeaderboardSettingsDto } from './dto';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { shiftStartTime: true, shiftEndTime: true, leaderboardSettings: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getSettings(organizationId: string): Promise<LeaderboardSettings> {
    return readSettings((await this.getOrg(organizationId)).leaderboardSettings);
  }

  async updateSettings(organizationId: string, dto: UpdateLeaderboardSettingsDto): Promise<LeaderboardSettings> {
    const next = readSettings({ ...(await this.getSettings(organizationId)), ...dto });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { leaderboardSettings: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  async getLeaderboard(user: CurrentUserData, query: LeaderboardQueryDto) {
    const org = await this.getOrg(user.organizationId);
    const settings = readSettings(org.leaderboardSettings);
    const metric = query.metric && settings.metrics.includes(query.metric) ? query.metric : settings.metrics[0];

    const to = query.to ?? query.from;
    const shift = { ...DEFAULT_SHIFT_HOURS, ...(org.shiftStartTime && { shiftStartTime: org.shiftStartTime }), ...(org.shiftEndTime && { shiftEndTime: org.shiftEndTime }) };
    const { startDate, endDate } = applyShiftHours(new Date(query.from), new Date(to), shift);

    const [staff, complimentaryTypes] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true, roles: { hasSome: settings.roles } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.paymentType.findMany({
        where: { organizationId: user.organizationId, isComplimentary: true },
        select: { name: true },
      }),
    ]);
    const ids = staff.map((s) => s.id);
    const complimentaryNames = complimentaryTypes.map((p) => p.name);

    // Same notion of a sale as the dashboard: paid orders closed in the window, minus comps. An
    // order counts for its waiter, or for whoever rang it up when it has none (a cashier's walk-in).
    const base: Prisma.OrderWhereInput = {
      organizationId: user.organizationId,
      status: OrderStatus.CLOSED_PAID,
      closedAt: { gte: startDate, lte: endDate },
      ...(complimentaryNames.length > 0 && { payments: { none: { paymentMethod: { in: complimentaryNames } } } }),
    };
    const [byWaiter, byCreator] = ids.length
      ? await Promise.all([
          this.prisma.order.groupBy({
            by: ['waiterId'],
            where: { ...base, waiterId: { in: ids } },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.order.groupBy({
            by: ['createdById'],
            where: { ...base, waiterId: null, createdById: { in: ids } },
            _sum: { total: true },
            _count: true,
          }),
        ])
      : [[], []];

    const totals = new Map<string, StaffTotals>(
      staff.map((s) => [s.id, { userId: s.id, name: `${s.firstName} ${s.lastName}`.trim(), revenue: 0, orders: 0 }]),
    );
    const add = (id: string | null, sum: Prisma.Decimal | null, count: number) => {
      const t = id ? totals.get(id) : undefined;
      if (!t) return;
      t.revenue += Number(sum ?? 0);
      t.orders += count;
    };
    byWaiter.forEach((r) => add(r.waiterId, r._sum.total, r._count));
    byCreator.forEach((r) => add(r.createdById, r._sum.total, r._count));

    const canSeeAll = hasPermission(user.roles, 'LEADERBOARD_AMOUNTS_ALL');
    const board = buildLeaderboard([...totals.values()], metric, settings, user.id, canSeeAll);

    return {
      metric,
      period: { from: query.from, to },
      settings: {
        metrics: settings.metrics,
        topN: settings.topN,
        minOrders: settings.minOrders,
        showAmountsToAll: settings.showAmountsToAll,
      },
      ...board,
      // Whether the viewer is on the board's eligible roles at all — a manager viewing it isn't.
      canCompete: totals.has(user.id),
    };
  }
}
