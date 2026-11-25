import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import {
  DEFAULT_TIP_PRESETS,
  runIdempotent,
  startOfNextZonedDay,
  startOfZonedDay,
  todayInZone,
} from '../../common';
import { RecordTipPayoutDto, TipOwedQueryDto, UpdateTipSettingsDto } from './dto';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

export interface TipOwedRow {
  // null = tips on orders nobody owned, held until a manager assigns or pays them out.
  waiterId: string | null;
  name: string;
  openingBalance: number;
  earned: number;
  voided: number;
  paidOut: number;
  balance: number;
}

@Injectable()
export class TipsService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  async getSettings(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { tipsEnabled: true, tipPresets: true },
    });
    return { enabled: org.tipsEnabled, presets: org.tipPresets.length ? org.tipPresets : DEFAULT_TIP_PRESETS };
  }

  async updateSettings(organizationId: string, dto: UpdateTipSettingsDto) {
    const presets = dto.presets ? [...new Set(dto.presets)].sort((a, b) => a - b) : undefined;
    if (presets && presets.length === 0) throw new BadRequestException('Add at least one tip preset');
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(typeof dto.enabled === 'boolean' && { tipsEnabled: dto.enabled }),
        ...(presets && { tipPresets: presets }),
      },
    });
    return this.getSettings(organizationId);
  }

  /**
   * Per-waiter "Tips earned | Paid out | Balance owed" for a business-date range (the org's own
   * timezone). The balance is the whole ledger up to the end of the range, so anything unpaid from
   * earlier days carries forward on its own; `openingBalance` shows how much of it was brought in.
   * A live view, not a snapshot tied to shift close — balances outlive any one shift.
   */
  async owedReport(organizationId: string, query: TipOwedQueryDto) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const from = query.from ?? todayInZone(org.timezone);
    const to = query.to ?? from;
    const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!dateOk(from) || !dateOk(to) || to < from) throw new BadRequestException('Invalid date range');
    const start = startOfZonedDay(from, org.timezone);
    const end = startOfNextZonedDay(to, org.timezone);

    const grouped = await this.prisma.tipLedgerEntry.groupBy({
      by: ['waiterId', 'type', 'paidFrom'],
      where: { organizationId, createdAt: { lt: end } },
      _sum: { amount: true },
    });
    // Split each group into before-range vs in-range by querying the in-range ones separately —
    // two cheap aggregates beat pulling every ledger row.
    const inRange = await this.prisma.tipLedgerEntry.groupBy({
      by: ['waiterId', 'type'],
      where: { organizationId, createdAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const rows = new Map<string | null, TipOwedRow>();
    const row = (waiterId: string | null): TipOwedRow => {
      let r = rows.get(waiterId);
      if (!r) {
        r = { waiterId, name: '', openingBalance: 0, earned: 0, voided: 0, paidOut: 0, balance: 0 };
        rows.set(waiterId, r);
      }
      return r;
    };
    for (const g of grouped) row(g.waiterId).balance += num(g._sum.amount);
    for (const g of inRange) {
      const r = row(g.waiterId);
      const amount = num(g._sum.amount);
      if (g.type === 'EARNED') r.earned += amount;
      else if (g.type === 'VOIDED') r.voided += amount;
      else r.paidOut += -amount;
    }

    const waiterIds = [...rows.keys()].filter((id): id is string => id !== null);
    const users = waiterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: waiterIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    const result = [...rows.values()]
      .map((r) => {
        const balance = round2(r.balance);
        const earned = round2(r.earned);
        const voided = round2(r.voided);
        const paidOut = round2(r.paidOut);
        return {
          ...r,
          name: r.waiterId ? (names.get(r.waiterId) ?? 'Former staff') : 'Unassigned',
          earned,
          voided,
          paidOut,
          balance,
          // Everything owed at the start of the range = closing balance less what happened inside it.
          openingBalance: round2(balance - earned - voided + paidOut),
        };
      })
      .filter((r) => r.balance !== 0 || r.earned !== 0 || r.voided !== 0 || r.paidOut !== 0)
      .sort((a, b) => b.balance - a.balance);

    return {
      from,
      to,
      rows: result,
      totals: {
        earned: round2(result.reduce((s, r) => s + r.earned, 0)),
        voided: round2(result.reduce((s, r) => s + r.voided, 0)),
        paidOut: round2(result.reduce((s, r) => s + r.paidOut, 0)),
        balance: round2(result.reduce((s, r) => s + r.balance, 0)),
      },
    };
  }

  /** Running ledger for one waiter (or the unassigned pool), newest first. */
  async ledger(organizationId: string, waiterId: string | undefined) {
    const entries = await this.prisma.tipLedgerEntry.findMany({
      where: { organizationId, waiterId: waiterId ?? null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        tip: { select: { orderId: true, paymentMethod: true } },
      },
    });
    const approverIds = [...new Set(entries.map((e) => e.approvedById).filter((id): id is string => !!id))];
    const approvers = approverIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const approverNames = new Map(approvers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: num(e.amount),
      paidFrom: e.paidFrom,
      note: e.note,
      createdAt: e.createdAt,
      orderId: e.tip?.orderId ?? null,
      paymentMethod: e.tip?.paymentMethod ?? null,
      approvedBy: e.approvedById ? (approverNames.get(e.approvedById) ?? null) : null,
    }));
  }

  /**
   * Marks tips paid out to a waiter: appends a negative PAYOUT entry stamped with who approved it
   * and when. The approver is resolved the same way a void's is — a supervisor or above signed in
   * approves themselves, anyone lower needs a supervisor's PIN. A payout can't exceed the balance
   * owed, and a row lock on the waiter keeps two simultaneous payouts from both passing that check.
   */
  async recordPayout(organizationId: string, actor: { id: string; roles: string[] }, dto: RecordTipPayoutDto) {
    const approvedById = await this.ordersService.resolveApprover(organizationId, actor, dto.approverPin);
    const waiterId = dto.waiterId ?? null;
    if (waiterId) {
      const waiter = await this.prisma.user.findFirst({ where: { id: waiterId, organizationId }, select: { id: true } });
      if (!waiter) throw new BadRequestException('Unknown staff member');
    }

    return runIdempotent(this.prisma, organizationId, 'TIP_PAYOUT', dto.clientRequestId, async (tx) => {
      if (waiterId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${waiterId} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;

      const sum = await tx.tipLedgerEntry.aggregate({
        where: { organizationId, waiterId },
        _sum: { amount: true },
      });
      const balance = round2(num(sum._sum.amount));
      if (dto.amount > balance + 0.001) {
        throw new BadRequestException(`Payout exceeds the balance owed (₦${balance.toLocaleString()})`);
      }
      const entry = await tx.tipLedgerEntry.create({
        data: {
          organizationId,
          waiterId,
          type: 'PAYOUT',
          amount: -dto.amount,
          paidFrom: dto.paidFrom,
          approvedById,
          recordedById: actor.id,
          note: dto.note?.trim() || null,
        },
      });
      return { id: entry.id, amount: dto.amount, balance: round2(balance - dto.amount), paidAt: entry.createdAt };
    });
  }
}
