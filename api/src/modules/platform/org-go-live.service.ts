import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/** Stock movements created by trading (sales, invoices). Restocks and manual adjustments are setup, so they stay. */
const ACTIVITY_MOVEMENT_TYPES: StockMovementType[] = [
  'ORDER_DEDUCTED',
  'INVOICE_RESERVED',
  'INVOICE_DEDUCTED',
  'RESERVATION_RELEASED',
];

function activityMovementsWhere(organizationId: string): Prisma.StockMovementWhereInput {
  return {
    organizationId,
    OR: [{ orderId: { not: null } }, { invoiceId: { not: null } }, { type: { in: ACTIVITY_MOVEMENT_TYPES } }],
  };
}

export interface GoLiveCounts {
  orders: number;
  payments: number;
  shifts: number;
  invoices: number;
  expenses: number;
  walletTransactions: number;
  unreconciledTransfers: number;
  whatsappMessages: number;
  stockMovements: number;
  stockItemsRestored: number;
  customers: number;
  customersWithWalletBalance: number;
}

export interface GoLivePreview {
  organization: { id: string; name: string; wentLiveAt: Date | null };
  counts: GoLiveCounts;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}

/**
 * Platform-admin "Go live": deletes everything a new org did while being set up and demoed
 * (orders, payments, shifts, invoices, expenses, wallet activity, sale stock movements…) and
 * keeps everything they configured (menu, inventory items, tables, staff, settings).
 *
 * Runs once per org: it stamps Organization.wentLiveAt and refuses to run again, so a live
 * org's real trading can never be wiped by a second press.
 */
@Injectable()
export class OrgGoLiveService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(organizationId: string): Promise<GoLivePreview> {
    const org = await this.findOrg(organizationId);
    const counts = await this.count(this.prisma, organizationId);

    const where = { organizationId };
    const [orders, payments, invoices, expenses] = await Promise.all([
      this.prisma.order.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
      this.prisma.payment.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
      this.prisma.invoice.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
      this.prisma.expense.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
    ]);
    const aggs = [orders, payments, invoices, expenses];
    const mins = aggs.map((a) => a._min.createdAt).filter((d): d is Date => !!d);
    const maxes = aggs.map((a) => a._max.createdAt).filter((d): d is Date => !!d);

    return {
      organization: { id: org.id, name: org.name, wentLiveAt: org.wentLiveAt },
      counts,
      firstActivityAt: mins.length ? new Date(Math.min(...mins.map((d) => d.getTime()))) : null,
      lastActivityAt: maxes.length ? new Date(Math.max(...maxes.map((d) => d.getTime()))) : null,
    };
  }

  async goLive(
    organizationId: string,
    input: { confirmName: string; deleteCustomers?: boolean },
    admin: { id: string; email: string },
  ) {
    const org = await this.findOrg(organizationId);
    if (org.wentLiveAt) {
      throw new ConflictException(`${org.name} already went live on ${org.wentLiveAt.toISOString()}`);
    }
    if (input.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
      throw new BadRequestException('Type the organization name exactly to confirm');
    }
    const deleteCustomers = !!input.deleteCustomers;

    return this.prisma.$transaction(
      async (tx) => {
        // Claim the org inside the transaction so two simultaneous presses can't both run.
        const wentLiveAt = new Date();
        const locked = await tx.organization.updateMany({
          where: { id: organizationId, wentLiveAt: null },
          data: { wentLiveAt },
        });
        if (locked.count === 0) throw new ConflictException(`${org.name} already went live`);

        const counts = await this.count(tx, organizationId);
        counts.customers = deleteCustomers ? counts.customers : 0;

        await this.restoreStock(tx, organizationId);
        await this.deleteActivity(tx, organizationId);
        await this.resetCustomers(tx, organizationId, deleteCustomers);
        await tx.restaurantTable.updateMany({
          where: { organizationId, status: { in: ['OCCUPIED', 'NEEDS_CLEANING'] } },
          data: { status: 'AVAILABLE' },
        });

        const summary = {
          ranBy: { id: admin.id, email: admin.email },
          deleteCustomers,
          counts,
        };
        await tx.organization.update({
          where: { id: organizationId },
          data: { goLiveSummary: summary as unknown as Prisma.InputJsonValue },
        });

        return { organizationId, wentLiveAt, ...summary };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  private async findOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, wentLiveAt: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private async count(db: Tx | PrismaService, organizationId: string): Promise<GoLiveCounts> {
    const where = { organizationId };
    const [
      orders,
      payments,
      shifts,
      invoices,
      expenses,
      walletTransactions,
      unreconciledTransfers,
      whatsappMessages,
      stockMovements,
      stockItems,
      customers,
      customersWithWalletBalance,
    ] = await Promise.all([
      db.order.count({ where }),
      db.payment.count({ where }),
      db.shift.count({ where }),
      db.invoice.count({ where }),
      db.expense.count({ where }),
      db.walletTransaction.count({ where }),
      db.moniepointUnreconciledTransfer.count({ where }),
      db.whatsappMessage.count({ where }),
      db.stockMovement.count({ where: activityMovementsWhere(organizationId) }),
      db.stockMovement.groupBy({ by: ['inventoryItemId'], where: activityMovementsWhere(organizationId) }),
      db.customer.count({ where }),
      db.customer.count({ where: { organizationId, walletBalance: { not: 0 } } }),
    ]);
    return {
      orders,
      payments,
      shifts,
      invoices,
      expenses,
      walletTransactions,
      unreconciledTransfers,
      whatsappMessages,
      stockMovements,
      stockItemsRestored: stockItems.length,
      customers,
      customersWithWalletBalance,
    };
  }

  /**
   * Undo what test sales and invoices did to on-hand stock: subtract each item's net change from
   * the movements about to be deleted. Restocks and manual adjustments are kept, so opening stock
   * the owner entered during setup survives. Reservations only come from invoices, all of which
   * are deleted, so reserved stock goes to zero.
   */
  private async restoreStock(tx: Tx, organizationId: string) {
    const movements = await tx.stockMovement.findMany({
      where: activityMovementsWhere(organizationId),
      select: { inventoryItemId: true, onHandBefore: true, onHandAfter: true },
    });
    const netChange = new Map<string, Prisma.Decimal>();
    for (const m of movements) {
      const prev = netChange.get(m.inventoryItemId) ?? new Prisma.Decimal(0);
      netChange.set(m.inventoryItemId, prev.plus(m.onHandAfter.minus(m.onHandBefore)));
    }
    for (const [inventoryItemId, change] of netChange) {
      if (change.isZero()) continue;
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { onHandQuantity: { decrement: change } },
      });
    }
    await tx.inventoryItem.updateMany({ where: { organizationId }, data: { reservedQuantity: 0 } });
  }

  /** Children before parents. Order items, print jobs, shift breakdowns, invoice items and installments cascade. */
  private async deleteActivity(tx: Tx, organizationId: string) {
    const where = { organizationId };
    await tx.walletTransaction.deleteMany({ where });
    await tx.moniepointUnreconciledTransfer.deleteMany({ where });
    await tx.stockMovement.deleteMany({ where: activityMovementsWhere(organizationId) });
    await tx.payment.deleteMany({ where });
    await tx.whatsappMessage.deleteMany({ where });
    await tx.sheetSyncQueueEntry.deleteMany({ where });
    await tx.idempotencyKey.deleteMany({ where });
    await tx.order.deleteMany({ where });
    await tx.shift.deleteMany({ where });
    await tx.invoice.deleteMany({ where });
    await tx.expense.deleteMany({ where });
    await tx.taxReportLog.deleteMany({ where });
  }

  /** Wallet balances must match the (now empty) ledger, so they go to zero either way. */
  private async resetCustomers(tx: Tx, organizationId: string, deleteCustomers: boolean) {
    if (deleteCustomers) {
      await tx.customer.deleteMany({ where: { organizationId } });
      return;
    }
    await tx.customer.updateMany({ where: { organizationId }, data: { walletBalance: 0 } });
  }
}
