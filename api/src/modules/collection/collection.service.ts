import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CollectionPeriod, CollectionPeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData, startOfNextZonedDay, startOfZonedDay, todayInZone } from '../../common';
import { computeZone, outcomeFor, periodPhase } from './collection.zones';
import { toCsv } from './collection.csv';
import { CreateCollectionPeriodDto, SetOverrideDto, UpdateCollectionPeriodDto } from './dto';

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

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

  /**
   * Everyone in scope for a period with their final-to-date count (credits in the window, revoked
   * ones left out, plus any opening count), ranked. One place so the leaderboard, the outcome report
   * and the lock all agree on the numbers.
   */
  private async standings(
    organizationId: string,
    period: CollectionPeriod,
    tz: string,
    today: string,
    opts: { meId?: string; includeCreditedInactive?: boolean } = {},
  ) {
    const from = startOfZonedDay(period.startDate, tz);
    const to = startOfNextZonedDay(period.endDate, tz);
    const todayFrom = startOfZonedDay(today, tz);
    const todayTo = startOfNextZonedDay(today, tz);
    const window = { organizationId, revokedAt: null, capturedAt: { gte: from, lt: to } };

    const [staff, overrides, totals, todays] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId,
          roles: { hasSome: period.rolesInScope as never[] },
          // Payroll still needs someone who left mid-period after earning credits.
          ...(opts.includeCreditedInactive
            ? { OR: [{ isActive: true }, { phoneCredits: { some: window } }] }
            : { isActive: true }),
        },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.collectionOverride.findMany({ where: { periodId: period.id } }),
      this.prisma.phoneCredit.groupBy({
        by: ['userId'],
        where: window,
        _count: true,
        _max: { capturedAt: true },
      }),
      this.prisma.phoneCredit.groupBy({
        by: ['userId'],
        where: { organizationId, revokedAt: null, capturedAt: { gte: todayFrom, lt: todayTo } },
        _count: true,
      }),
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
        isMe: s.id === opts.meId,
      };
    });
    rows.sort((a, b) => b.count - a.count || a.reachedAt - b.reachedAt || a.name.localeCompare(b.name));
    return rows;
  }

  async getLeaderboard(user: CurrentUserData, periodId?: string) {
    const tz = await this.timezone(user.organizationId);
    const today = todayInZone(tz);
    const period = await this.pickPeriod(user.organizationId, periodId, today);
    if (!period) return { period: null };

    const phase = periodPhase(period.startDate, period.endDate, today);
    const [standings, coverage] = await Promise.all([
      this.standings(user.organizationId, period, tz, today, { meId: user.id }),
      this.coverage(user.organizationId),
    ]);
    const rows = standings;

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

  // ── Period outcome, lock and payroll export ──────────────────────────────────────────────────

  /**
   * What each person finished with and what payroll should apply. A locked period reads its frozen
   * snapshot; an open one is computed live and marked provisional.
   */
  async getOutcome(organizationId: string, periodId: string) {
    const period = await this.getPeriodOrThrow(organizationId, periodId);
    const tz = await this.timezone(organizationId);
    const today = todayInZone(tz);
    const rates = { rewardAmount: Number(period.rewardAmount), deductionPct: period.deductionPct };

    let rows: { userId: string; name: string; count: number; minimum: number; threshold: number; zone: string; incentiveAmount: number; deductionPct: number }[];
    if (period.status === CollectionPeriodStatus.LOCKED) {
      const results = await this.prisma.collectionPeriodResult.findMany({ where: { periodId } });
      rows = results
        .map((r) => ({
          userId: r.userId,
          name: r.name,
          count: r.count,
          minimum: r.minimum,
          threshold: r.threshold,
          zone: r.zone as string,
          incentiveAmount: Number(r.incentiveAmount),
          deductionPct: r.deductionPct,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    } else {
      const live = await this.standings(organizationId, period, tz, today, { includeCreditedInactive: true });
      rows = live.map((r) => ({
        userId: r.userId,
        name: r.name,
        count: r.count,
        minimum: r.minimum,
        threshold: r.threshold,
        ...outcomeFor(r.count, { minimum: r.minimum, threshold: r.threshold }, rates),
      }));
    }

    return {
      period: {
        id: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
        lockedAt: period.lockedAt,
        rewardAmount: rates.rewardAmount,
        deductionPct: rates.deductionPct,
      },
      // Not payroll-ready until the period is locked.
      provisional: period.status !== CollectionPeriodStatus.LOCKED,
      ended: today > period.endDate,
      rows,
      totals: {
        incentiveDue: rows.reduce((n, r) => n + r.incentiveAmount, 0),
        deductions: rows.filter((r) => r.deductionPct > 0).length,
      },
    };
  }

  async outcomeCsv(organizationId: string, periodId: string): Promise<{ filename: string; csv: string }> {
    const outcome = await this.getOutcome(organizationId, periodId);
    const status = outcome.provisional ? 'PROVISIONAL (period not locked)' : 'FINAL';
    const verdict = (zone: string) => (zone === 'GREEN' ? 'Incentive due' : zone === 'RED' ? 'Deduction applies' : 'No incentive, no deduction');
    const rows: (string | number)[][] = [
      ['Staff', 'Final count', 'Minimum', 'Reward threshold', 'Zone', 'Outcome', 'Incentive due (NGN)', 'Service charge deduction (%)', 'Status'],
      ...outcome.rows.map((r) => [r.name, r.count, r.minimum, r.threshold, r.zone, verdict(r.zone), r.incentiveAmount, r.deductionPct, status]),
    ];
    const slug = outcome.period.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'period';
    return { filename: `phone-collection-${slug}-${outcome.provisional ? 'provisional' : 'final'}.csv`, csv: toCsv(rows) };
  }

  /**
   * Freeze a period's outcome once it has ended. Idempotent and race-safe: the status flip is a
   * conditional update, so two callers (the hourly job and an admin) can't both write results.
   */
  async lockPeriod(organizationId: string, periodId: string) {
    const period = await this.getPeriodOrThrow(organizationId, periodId);
    if (period.status === CollectionPeriodStatus.LOCKED) return { locked: false, alreadyLocked: true, results: 0 };

    const tz = await this.timezone(organizationId);
    const today = todayInZone(tz);
    if (today <= period.endDate) {
      throw new ConflictException('This period has not ended yet — it can be locked from the day after its end date');
    }

    const rows = await this.standings(organizationId, period, tz, today, { includeCreditedInactive: true });
    const rates = { rewardAmount: Number(period.rewardAmount), deductionPct: period.deductionPct };
    const locked = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.collectionPeriod.updateMany({
        where: { id: periodId, status: CollectionPeriodStatus.OPEN },
        data: { status: CollectionPeriodStatus.LOCKED, lockedAt: new Date() },
      });
      if (flipped.count === 0) return false;
      await tx.collectionPeriodResult.createMany({
        data: rows.map((r) => ({
          periodId,
          userId: r.userId,
          name: r.name,
          count: r.count,
          minimum: r.minimum,
          threshold: r.threshold,
          ...outcomeFor(r.count, { minimum: r.minimum, threshold: r.threshold }, rates),
        })),
        skipDuplicates: true,
      });
      return true;
    });
    return { locked, alreadyLocked: !locked, results: locked ? rows.length : 0 };
  }

  /** Hourly job: lock every open period whose end date has passed in its organization's timezone. */
  async lockDuePeriods(): Promise<number> {
    const open = await this.prisma.collectionPeriod.findMany({
      where: { status: CollectionPeriodStatus.OPEN },
      include: { organization: { select: { timezone: true } } },
    });
    let locked = 0;
    for (const p of open) {
      if (todayInZone(p.organization.timezone) <= p.endDate) continue;
      try {
        if ((await this.lockPeriod(p.organizationId, p.id)).locked) locked++;
      } catch (err) {
        this.logger.error(`Locking collection period ${p.id} failed: ${(err as Error).message}`);
      }
    }
    return locked;
  }
}
