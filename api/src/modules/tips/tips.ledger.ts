import { Prisma } from '@prisma/client';

// Tip writes that have to happen inside another module's transaction (taking a payment, voiding an
// order). Plain functions over a transaction client, so OrdersService can call them without the
// two modules depending on each other.

export interface RecordTipInput {
  organizationId: string;
  orderId: string;
  // The order's waiter. Null when nobody owns the order — the tip is held as "unassigned".
  waiterId: string | null;
  paymentMethod: string;
  amount: number;
  recordedById: string;
}

export async function recordTip(tx: Prisma.TransactionClient, input: RecordTipInput) {
  const tip = await tx.tip.create({
    data: {
      organizationId: input.organizationId,
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      recordedById: input.recordedById,
    },
  });
  await tx.tipLedgerEntry.create({
    data: {
      organizationId: input.organizationId,
      waiterId: input.waiterId,
      tipId: tip.id,
      type: 'EARNED',
      amount: input.amount,
      recordedById: input.recordedById,
    },
  });
  return tip;
}

// Voiding a bill voids its tips: each tip is marked voided and its earned entries are reversed
// with a negative entry for the same waiter. If the waiter was already paid that tip, their balance
// simply goes negative and nets off their next payout (the guest's refund is handled separately).
export async function voidTipsForOrder(tx: Prisma.TransactionClient, organizationId: string, orderId: string, actorId: string) {
  const tips = await tx.tip.findMany({
    where: { organizationId, orderId, status: 'ACTIVE' },
    include: { ledgerEntries: { where: { type: 'EARNED' } } },
  });
  for (const tip of tips) {
    await tx.tip.update({ where: { id: tip.id }, data: { status: 'VOIDED', voidedAt: new Date() } });
    for (const earned of tip.ledgerEntries) {
      await tx.tipLedgerEntry.create({
        data: {
          organizationId,
          waiterId: earned.waiterId,
          tipId: tip.id,
          type: 'VOIDED',
          amount: earned.amount.negated(),
          recordedById: actorId,
          note: 'Order cancelled',
        },
      });
    }
  }
  return tips.length;
}
