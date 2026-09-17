import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PaymentSplitBucket = 'cash' | 'card' | 'transfer' | 'wallet' | 'other';

function toNumber(val: Prisma.Decimal | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === 'number' ? val : Number(val);
}

// Payment.paymentMethod is a free-form per-org string (a PaymentType name like "POS Terminal -
// GTBank") or one of a handful of reserved literals (PAYSTACK/WALLET/MONIEPOINT_POS/
// MONIEPOINT_TRANSFER) — there's no enum to switch on. This buckets any of those into the
// cash/card/transfer split accounting actually needs, keyed on substring matches since orgs
// name their own payment types freely.
function bucketPaymentMethod(method: string): PaymentSplitBucket {
  const normalized = method.toUpperCase();
  if (normalized === 'WALLET') return 'wallet';
  if (normalized === 'PAYSTACK' || normalized === 'MONIEPOINT_POS') return 'card';
  if (normalized === 'MONIEPOINT_TRANSFER') return 'transfer';
  if (normalized.includes('CASH')) return 'cash';
  if (normalized.includes('TRANSFER')) return 'transfer';
  if (normalized.includes('CARD') || normalized.includes('POS')) return 'card';
  return 'other';
}

// Orders whose lifecycle is actually final — the only two an accounting system should ever
// see. CLOSED_UNPAID (a tab still owed) and every still-open status are deliberately excluded,
// same as the POS Z-report (pos-reports.service.ts) and dashboard (pos-dashboard.service.ts).
const FEED_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CLOSED_PAID, OrderStatus.CANCELLED];

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService) {}

  async getSales() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: FEED_ORDER_STATUSES },
        organization: { isAccountingFeedEnabled: true },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        source: true,
        subtotal: true,
        discountAmount: true,
        total: true,
        notes: true,
        closedAt: true,
        createdAt: true,
        organization: { select: { name: true } },
        table: { select: { name: true } },
        payments: { select: { paymentMethod: true, amount: true } },
      },
    });

    return orders.map((order) => {
      const split: Record<PaymentSplitBucket, number> = { cash: 0, card: 0, transfer: 0, wallet: 0, other: 0 };
      for (const payment of order.payments) {
        const bucket = bucketPaymentMethod(payment.paymentMethod);
        split[bucket] += toNumber(payment.amount);
      }

      return {
        // Order.id never changes once assigned — safe to re-pull and de-duplicate on.
        id: order.id,
        date: (order.closedAt ?? order.createdAt).toISOString(),
        amount: toNumber(order.total),
        // CLOSED_UNPAID never appears here (see FEED_ORDER_STATUSES), so this is exhaustive.
        status: order.status === OrderStatus.CANCELLED ? 'voided' : 'completed',
        subtotal: toNumber(order.subtotal),
        discount: toNumber(order.discountAmount),
        paymentSplit: split,
        payments: order.payments.map((p) => ({ method: p.paymentMethod, amount: toNumber(p.amount) })),
        location: order.organization.name,
        table: order.table?.name ?? null,
        orderType: order.source,
        reference: `ORD-${order.id.slice(0, 5).toUpperCase()}`,
        description: order.notes ?? null,
      };
    });
  }
}
