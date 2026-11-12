import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CollectionPeriod, CollectionPeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData, startOfNextZonedDay, startOfZonedDay, todayInZone } from '../../common';
import { computeZone, periodPhase } from './collection.zones';
import { CreateCollectionPeriodDto, SetOverrideDto, UpdateCollectionPeriodDto } from './dto';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  private async timezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    if (!org) throw new NotFoundException('Organization not found');
    return org.timezone;
  }

  private validateDates(start: string, end: string, minimum: number, threshold: number) {
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) throw new BadRequestException('Invalid date');
    if (end < start) throw new BadRequestException('End date must not be before the start date');
    if (threshold < minimum) throw new BadRequestException('Reward threshold must be at least the minimum');
  }

  private async assertNoOverlap(organizationId: string, start: string, end: string, exceptId?: string) {
    const clash = await this.prisma.collectionPeriod.findFirst({
      where: { organizationId, startDate: { lte: end }, endDate: { gte: start }, ...(exceptId && { id: { not: exceptId } }) },
      select: { name: true },
    });
    if (clash) throw new ConflictException(`These dates overlap the existing period "${clash.name}"`);
  }

  // ── Periods ─────────────────────────────────────────────────────────────────────────────────

  listPeriods(organizationId: string) {
    return this.prisma.collectionPeriod.findMany({
      where: { organizationId },
      orderBy: { startDate: 'desc' },
      include: { overrides: true },
    });
  }

  async createPeriod(organizationId: string, dto: CreateCollectionPeriodDto) {
    this.validateDates(dto.startDate, dto.endDate, dto.minimum, dto.threshold);
    await this.assertNoOverlap(organizationId, dto.startDate, dto.endDate);
    return this.prisma.collectionPeriod.create({ data: { organizationId, ...dto } });
  }

  async updatePeriod(organizationId: string, id: string, dto: UpdateCollectionPeriodDto) {
    const period = await this.getPeriodOrThrow(organizationId, id);
    if (period.status === CollectionPeriodStatus.LOCKED) throw new ConflictException('A locked period cannot be changed');
    const next = { ...period, ...dto };
    this.validateDates(next.startDate, next.endDate, next.minimum, next.threshold);
    await this.assertNoOverlap(organizationId, next.startDate, next.endDate, id);
    return this.prisma.collectionPeriod.update({ where: { id }, data: dto });
  }

  async setOverride(organizationId: string, periodId: string, userId: string, dto: SetOverrideDto) {
    const period = await this.getPeriodOrThrow(organizationId, periodId);
    if (period.status === CollectionPeriodStatus.LOCKED) throw new ConflictException('A locked period cannot be changed');
    const staff = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return this.prisma.collectionOverride.upsert({
      where: { periodId_userId: { periodId, userId } },
      create: { periodId, userId, ...dto },
      update: dto,
    });
  }

  private async getPeriodOrThrow(organizationId: string, id: string): Promise<CollectionPeriod> {
    const period = await this.prisma.collectionPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Collection period not found');
    return period;
  }

  /** The requested period, else the one running today, else the most recent. */
  private async pickPeriod(organizationId: string, periodId: string | undefined, today: string): Promise<CollectionPeriod | null> {
    if (periodId) return this.getPeriodOrThrow(organizationId, periodId);
    const running = await this.prisma.collectionPeriod.findFirst({
      where: { organizationId, startDate: { lte: today }, endDate: { gte: today } },
      orderBy: { startDate: 'desc' },
    });
    return running ?? this.prisma.collectionPeriod.findFirst({ where: { organizationId }, orderBy: { startDate: 'desc' } });
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────────────────────────

  async getLeaderboard(user: CurrentUserData, periodId?: string) {
    const tz = await this.timezone(user.organizationId);
    const today = todayInZone(tz);
    const period = await this.pickPeriod(user.organizationId, periodId, today);
    if (!period) return { period: null };

    const from = startOfZonedDay(period.startDate, tz);
    const to = startOfNextZonedDay(period.endDate, tz);
    const todayFrom = startOfZonedDay(today, tz);
    const todayTo = startOfNextZonedDay(today, tz);
    const phase = periodPhase(period.startDate, period.endDate, today);

    const [staff, overrides, totals, todays, coverage] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true, roles: { hasSome: period.rolesInScope as never[] } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.collectionOverride.findMany({ where: { periodId: period.id } }),
      this.prisma.phoneCredit.groupBy({
        by: ['userId'],
        where: { organizationId: user.organizationId, revokedAt: null, capturedAt: { gte: from, lt: to } },
        _count: true,
        _max: { capturedAt: true },
      }),
      this.prisma.phoneCredit.groupBy({
        by: ['userId'],
        where: { organizationId: user.organizationId, revokedAt: null, capturedAt: { gte: todayFrom, lt: todayTo } },
        _count: true,
      }),
      this.coverage(user.organizationId),
    ]);

    const override = new Map(overrides.map((o) => [o.userId, o]));
    const counted = new Map(totals.map((t) => [t.userId, t]));
    const todayCount = new Map(todays.map((t) => [t.userId, t._count]));

    const rows = staff.map((s) => {
      const o = override.get(s.id);
      const minimum = o?.minimum ?? period.minimum;
      const threshold = o?.threshold ?? period.threshold;
      const count = (counted.get(s.id)?._count ?? 0) + (o?.openingCount ?? 0);
      const z = computeZone(count, { minimum, threshold }, period, today);
      return {
        userId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        count,
        today: todayCount.get(s.id) ?? 0,
        minimum,
        threshold,
        zone: z.zone,
        nextStep: z.nextStep,
        // Ties: whoever got there first (their latest credit is the earlier one).
        reachedAt: counted.get(s.id)?._max.capturedAt?.getTime() ?? 0,
        isMe: s.id === user.id,
      };
    });
    rows.sort((a, b) => b.count - a.count || a.reachedAt - b.reachedAt || a.name.localeCompare(b.name));

    return {
      period: {
        id: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
        phase,
        coverageGoalPct: period.coverageGoalPct,
      },
      team: {
        count: rows.reduce((n, r) => n + r.count, 0),
        minimum: rows.reduce((n, r) => n + r.minimum, 0),
        threshold: rows.reduce((n, r) => n + r.threshold, 0),
      },
      coverage,
      // Whether the viewer is in the scope of this period at all — a manager viewing it isn't.
      canCompete: rows.some((r) => r.isMe),
      entries: rows.map(({ reachedAt: _r, ...r }, i) => ({ rank: i + 1, ...r })),
    };
  }

  /**
   * Share of customers with a usable phone number. Approximate by design (a SQL pattern, not the
   * full validator) so it stays one cheap query however many customers an org has. The pattern
   * avoids backslashes on purpose: a tagged template cooks escapes, turning \s into a plain s.
   */
  private async coverage(organizationId: string) {
    const [row] = await this.prisma.$queryRaw<{ total: bigint; with_phone: bigint }[]>`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
          WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') ~ '^(234|0)?(70|80|81|90|91)[0-9]{8}$'
             OR (phone ~ '^[[:space:]]*[+]' AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 8 AND 15)
        ) AS with_phone
      FROM customers
      WHERE organization_id = ${organizationId} AND is_active = true
    `;
    const total = Number(row?.total ?? 0);
    const withPhone = Number(row?.with_phone ?? 0);
    return { customers: total, withPhone, pct: total ? Math.round((withPhone / total) * 1000) / 10 : 0 };
  }

  // ── Credits ─────────────────────────────────────────────────────────────────────────────────

  async listCredits(organizationId: string, periodId?: string, userId?: string) {
    const tz = await this.timezone(organizationId);
    const period = await this.pickPeriod(organizationId, periodId, todayInZone(tz));
    const where: Prisma.PhoneCreditWhereInput = {
      organizationId,
      ...(userId && { userId }),
      ...(period && { capturedAt: { gte: startOfZonedDay(period.startDate, tz), lt: startOfNextZonedDay(period.endDate, tz) } }),
    };
    const credits = await this.prisma.phoneCredit.findMany({
      where,
      orderBy: { capturedAt: 'desc' },
      take: 200,
      include: { user: { select: { firstName: true, lastName: true } }, customer: { select: { name: true } } },
    });
    return credits.map((c) => ({
      id: c.id,
      userId: c.userId,
      staffName: `${c.user.firstName} ${c.user.lastName}`.trim(),
      customerName: c.customer.name,
      phone: c.phone,
      source: c.source,
      capturedAt: c.capturedAt,
      revokedAt: c.revokedAt,
      revokeReason: c.revokeReason,
    }));
  }

  async revokeCredit(user: CurrentUserData, id: string, reason: string) {
    const credit = await this.prisma.phoneCredit.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!credit) throw new NotFoundException('Credit not found');
    if (credit.revokedAt) throw new ConflictException('This credit is already revoked');

    // Once a period is locked its counts are final (payroll may already have used them).
    const tz = await this.timezone(user.organizationId);
    const day = todayInZone(tz, credit.capturedAt);
    const locked = await this.prisma.collectionPeriod.findFirst({
      where: { organizationId: user.organizationId, status: CollectionPeriodStatus.LOCKED, startDate: { lte: day }, endDate: { gte: day } },
      select: { name: true },
    });
    if (locked) throw new ConflictException(`"${locked.name}" is locked, so its credits can no longer be revoked`);

    // Conditional update: two managers revoking at once can't both succeed.
    const res = await this.prisma.phoneCredit.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: user.id, revokeReason: reason },
    });
    if (res.count === 0) throw new ConflictException('This credit is already revoked');
    return { id, revoked: true };
  }
}
