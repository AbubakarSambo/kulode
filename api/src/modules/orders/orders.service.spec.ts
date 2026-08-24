import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { SheetSyncService } from '../sheet-sync';
import { PrintingService } from '../printers';

// ─── Mock helpers ────────────────────────────────────────────────────────────

type TxMock = ReturnType<typeof createTxMock>;

function createTxMock() {
  return {
    order: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    restaurantTable: { update: jest.fn() },
    payment: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    idempotencyKey: { create: jest.fn(), update: jest.fn() },
  };
}

function createMockPrisma() {
  const tx = createTxMock();

  return {
    order: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    // Both `cancel` (direct $transaction) and `runIdempotent` (via closeWithPayment) drive
    // everything through this same tx mock, so assertions can check either surface.
    $transaction: jest.fn((callback: (tx: TxMock) => Promise<unknown>) => callback(tx)),
    __tx: tx,
  };
}

const ORG_ID = 'org-abc-123';
const ORDER_ID = 'order-xyz-789';
const USER_ID = 'user-cashier-1';

function orderWith(overrides: object) {
  return {
    id: ORDER_ID,
    organizationId: ORG_ID,
    status: 'OPEN',
    total: 5000,
    customerId: null,
    tableId: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OrdersService — status transitions across the waiter/cashier split', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let inventoryService: { deductForOrder: jest.Mock };
  let walletService: { debit: jest.Mock };
  let sheetSync: { enqueue: jest.Mock };
  let printingService: { dispatchDocketsForNewItems: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    inventoryService = { deductForOrder: jest.fn() };
    walletService = { debit: jest.fn() };
    sheetSync = { enqueue: jest.fn() };
    printingService = { dispatchDocketsForNewItems: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventoryService },
        { provide: WalletService, useValue: walletService },
        { provide: SheetSyncService, useValue: sheetSync },
        { provide: PrintingService, useValue: printingService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
    // Re-wire $transaction after clearAllMocks reset its implementation.
    prisma.$transaction.mockImplementation((callback: (tx: TxMock) => Promise<unknown>) => callback(prisma.__tx));
  });

  // ─── markAwaitingPayment ───────────────────────────────────────────────────

  describe('markAwaitingPayment', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.markAwaitingPayment(ORG_ID, ORDER_ID)).rejects.toThrow(NotFoundException);
    });

    it.each(['CLOSED_PAID', 'CLOSED_UNPAID', 'CANCELLED'])(
      'rejects marking a %s order as awaiting payment',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue(orderWith({ status }));
        await expect(service.markAwaitingPayment(ORG_ID, ORDER_ID)).rejects.toThrow(BadRequestException);
      },
    );

    it('moves an OPEN order to CLOSED_UNPAID without touching Payment or inventory', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN' }));
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue(orderWith({ status: 'CLOSED_UNPAID' }));

      await service.markAwaitingPayment(ORG_ID, ORDER_ID);

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED_UNPAID' }) }),
      );
      expect(prisma.__tx.payment.create).not.toHaveBeenCalled();
      expect(inventoryService.deductForOrder).not.toHaveBeenCalled();
    });

    it('throws when a concurrent action already moved the order out of an open status', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN' }));
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markAwaitingPayment(ORG_ID, ORDER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancel (void) ──────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.cancel(ORG_ID, ORDER_ID)).rejects.toThrow(NotFoundException);
    });

    it('rejects cancelling an already-CLOSED_PAID order (no refund/void-a-paid-order path exists)', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CLOSED_PAID' }));
      await expect(service.cancel(ORG_ID, ORDER_ID)).rejects.toThrow(BadRequestException);
    });

    it('allows cancelling a CLOSED_UNPAID order (voiding before payment was taken)', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CLOSED_UNPAID', tableId: 'table-1' }));
      prisma.__tx.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel(ORG_ID, ORDER_ID);

      expect(prisma.__tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: expect.arrayContaining(['OPEN', 'CLOSED_UNPAID']) } }),
          data: { status: 'CANCELLED' },
        }),
      );
      expect(prisma.__tx.restaurantTable.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'table-1' }, data: { status: 'AVAILABLE' } }),
      );
      expect(result).toMatchObject({ message: 'Order cancelled successfully' });
    });

    it('allows cancelling an OPEN order (unchanged prior behavior)', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN' }));
      prisma.__tx.order.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.cancel(ORG_ID, ORDER_ID)).resolves.toMatchObject({
        message: 'Order cancelled successfully',
      });
    });
  });

  // ─── closeWithPayment (accepting payment) ──────────────────────────────────

  describe('closeWithPayment', () => {
    const dto = { paymentMethod: 'CASH' as const, clientRequestId: 'req-1' };

    beforeEach(() => {
      prisma.__tx.payment.create.mockResolvedValue({ id: 'payment-1', amount: 5000, paymentMethod: 'CASH', paymentDate: new Date() });
      prisma.__tx.order.findUniqueOrThrow.mockResolvedValue(
        orderWith({ status: 'CLOSED_PAID', closedAt: new Date() }),
      );
      prisma.__tx.user.findUnique.mockResolvedValue({ firstName: 'A', lastName: 'B' });
    });

    it('rejects closing a CANCELLED order', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CANCELLED' }));
      await expect(service.closeWithPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('accepts payment on a CLOSED_UNPAID order — the new "cashier finishes it" step', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CLOSED_UNPAID' }));
      prisma.__tx.order.updateMany.mockResolvedValue({ count: 1 });

      await service.closeWithPayment(ORG_ID, ORDER_ID, USER_ID, dto);

      expect(prisma.__tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: expect.arrayContaining(['OPEN', 'CLOSED_UNPAID']) } }),
          data: expect.objectContaining({ status: 'CLOSED_PAID' }),
        }),
      );
      expect(prisma.__tx.payment.create).toHaveBeenCalled();
      expect(inventoryService.deductForOrder).toHaveBeenCalledWith(prisma.__tx, ORDER_ID, ORG_ID);
    });

    it('still closes+pays a plain OPEN order in one step (old single-step behavior unchanged)', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN' }));
      prisma.__tx.order.updateMany.mockResolvedValue({ count: 1 });

      await service.closeWithPayment(ORG_ID, ORDER_ID, USER_ID, dto);

      expect(prisma.__tx.payment.create).toHaveBeenCalled();
      expect(inventoryService.deductForOrder).toHaveBeenCalled();
    });
  });
});
