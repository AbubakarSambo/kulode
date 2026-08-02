import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, runIdempotent } from '../../common';
import { SheetSyncService } from '../sheet-sync';
import { TopUpWalletDto, AdjustWalletDto, WalletTransactionFilterDto } from './dto';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

interface ApplyMovementParams {
  signedDelta: number;
  type: WalletTransactionType;
  orderId?: string;
  paymentId?: string;
  reference?: string;
  notes?: string;
}

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private sheetSync: SheetSyncService,
  ) {}

  async getBalance(organizationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, walletBalance: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return { customerId: customer.id, balance: toNumber(customer.walletBalance) };
  }

  async listTransactions(
    organizationId: string,
    customerId: string,
    filter: WalletTransactionFilterDto,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const { page = 1, limit = 20, type } = filter;
    const skip = (page - 1) * limit;
    const where: Prisma.WalletTransactionWhereInput = {
      organizationId,
      customerId,
      ...(type && { type }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return paginate(transactions, total, page, limit);
  }

  /**
   * Core ledger write: reads the current balance inside the caller's transaction, applies the
   * signed delta, and writes both the new Customer.walletBalance and the WalletTransaction row
   * atomically. This is the only place that ever mutates walletBalance — every credit/debit
   * anywhere in the app (top-up, manual adjustment, order settlement) goes through here, so the
   * cached balance can never drift from the sum of its ledger rows.
   */
  private async applyMovement(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
    userId: string,
    params: ApplyMovementParams,
  ) {
    const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const balanceBefore = toNumber(customer.walletBalance);
    const balanceAfter = Math.round((balanceBefore + params.signedDelta) * 100) / 100;

    await tx.customer.update({
      where: { id: customerId },
      data: { walletBalance: balanceAfter },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        organizationId,
        customerId,
        type: params.type,
        amount: params.signedDelta,
        balanceBefore,
        balanceAfter,
        orderId: params.orderId,
        paymentId: params.paymentId,
        createdById: userId,
        reference: params.reference,
        notes: params.notes,
      },
    });

    const createdBy = await tx.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    await this.sheetSync.enqueue(tx, organizationId, 'WALLET_TRANSACTIONS', [
      transaction.id,
      transaction.createdAt.toISOString(),
      customer.name,
      transaction.type,
      toNumber(transaction.amount),
      balanceBefore,
      balanceAfter,
      params.orderId ?? '',
      createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : '',
      params.notes ?? '',
    ]);

    return transaction;
  }

  /** Debits a customer's wallet — allowed to go negative (on-account model). */
  async debit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
    userId: string,
    params: { amount: number; type: WalletTransactionType; orderId?: string; paymentId?: string; reference?: string; notes?: string },
  ) {
    return this.applyMovement(tx, organizationId, customerId, userId, {
      ...params,
      signedDelta: -Math.abs(params.amount),
    });
  }

  /** Credits a customer's wallet. */
  async credit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
    userId: string,
    params: { amount: number; type: WalletTransactionType; orderId?: string; paymentId?: string; reference?: string; notes?: string },
  ) {
    return this.applyMovement(tx, organizationId, customerId, userId, {
      ...params,
      signedDelta: Math.abs(params.amount),
    });
  }

  async topUp(organizationId: string, customerId: string, userId: string, dto: TopUpWalletDto) {
    return runIdempotent(
      this.prisma,
      organizationId,
      'WALLET_TOPUP',
      dto.clientRequestId,
      (tx) =>
        this.credit(tx, organizationId, customerId, userId, {
          amount: dto.amount,
          type: 'TOPUP',
          reference: dto.reference,
          notes: dto.notes ?? `Top-up via ${dto.paymentMethod}`,
        }),
    );
  }

  async adjust(organizationId: string, customerId: string, userId: string, dto: AdjustWalletDto) {
    return runIdempotent(
      this.prisma,
      organizationId,
      'WALLET_ADJUST',
      dto.clientRequestId,
      (tx) =>
        this.applyMovement(tx, organizationId, customerId, userId, {
          signedDelta: dto.amount,
          type: 'ADJUSTMENT',
          notes: dto.reason,
        }),
    );
  }
}
