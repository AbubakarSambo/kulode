import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { SheetSyncService } from '../sheet-sync';
import { PrintingService } from '../printers';
import { OrderTypesService } from '../order-types';

// ─── Mock helpers ────────────────────────────────────────────────────────────

type TxMock = ReturnType<typeof createTxMock>;

function createTxMock() {
  return {
    order: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    orderItem: { create: jest.fn() },
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
    menuItem: { findMany: jest.fn() },
    organization: { findUniqueOrThrow: jest.fn() },
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
    // Matches the DB column default (Decimal @default(0)) — a real order row is never missing
    // this, so the mock shouldn't be either.
    amountPaid: 0,
    customerId: null,
    tableId: null,
    // orderInclude always returns items as an array (empty at minimum), never undefined.
    items: [],
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
  let printingService: { dispatchDocketsForNewItems: jest.Mock; dispatchDocketsForCancellation: jest.Mock };
  let orderTypesService: { requiresTable: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    inventoryService = { deductForOrder: jest.fn() };
    walletService = { debit: jest.fn() };
    sheetSync = { enqueue: jest.fn() };
    printingService = {
      dispatchDocketsForNewItems: jest.fn().mockResolvedValue(undefined),
      dispatchDocketsForCancellation: jest.fn().mockResolvedValue(undefined),
    };
    // Only create/setSource/moveItems consult this — defaults to "Dine In behaves like the old
    // DINE_IN enum value" for any test that happens to exercise those paths.
    orderTypesService = { requiresTable: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventoryService },
        { provide: WalletService, useValue: walletService },
        { provide: SheetSyncService, useValue: sheetSync },
        { provide: PrintingService, useValue: printingService },
        { provide: OrderTypesService, useValue: orderTypesService },
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
      prisma.__tx.order.findUniqueOrThrow.mockResolvedValue(orderWith({ status: 'CANCELLED', items: [] }));

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
      prisma.__tx.order.findUniqueOrThrow.mockResolvedValue(orderWith({ status: 'CANCELLED', items: [] }));

      await expect(service.cancel(ORG_ID, ORDER_ID)).resolves.toMatchObject({
        message: 'Order cancelled successfully',
      });
    });

    it('dispatches a CANCELLED docket for the order\'s items after commit', async () => {
      const items = [{ id: 'item-1', menuItemId: 'menu-1', itemName: 'Burger', quantity: 2, notes: null }];
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN', tableId: 'table-1' }));
      prisma.__tx.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.order.findUniqueOrThrow.mockResolvedValue(orderWith({ status: 'CANCELLED', items }));

      await service.cancel(ORG_ID, ORDER_ID);

      expect(printingService.dispatchDocketsForCancellation).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ id: ORDER_ID }),
        expect.arrayContaining([expect.objectContaining({ itemName: 'Burger', quantity: 2 })]),
      );
    });
  });

  // ─── addItems ───────────────────────────────────────────────────────────────

  describe('addItems', () => {
    const dto = {
      items: [{ menuItemId: 'menu-1', quantity: 1 }],
      clientRequestId: 'req-add-1',
    };

    beforeEach(() => {
      prisma.menuItem.findMany.mockResolvedValue([
        { id: 'menu-1', name: 'Burger', price: 2000, isAvailable: true },
      ]);
      prisma.organization.findUniqueOrThrow.mockResolvedValue({
        taxRate: 0,
        entertainmentTaxRate: 0,
        serviceChargeRate: 0,
      });
      prisma.__tx.orderItem.create.mockImplementation((args: { data: object }) =>
        Promise.resolve({ id: 'item-new-1', ...args.data }),
      );
    });

    it('rejects adding items to a CLOSED_PAID order', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CLOSED_PAID', discountAmount: 0 }));
      await expect(service.addItems(ORG_ID, ORDER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects adding items to a CANCELLED order', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'CANCELLED', discountAmount: 0 }));
      await expect(service.addItems(ORG_ID, ORDER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('allows adding items to a CLOSED_UNPAID order and reopens it to OPEN', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderWith({ status: 'CLOSED_UNPAID', discountAmount: 0, subtotal: 5000, closedAt: new Date() }),
      );
      prisma.__tx.order.update.mockResolvedValue(
        orderWith({
          status: 'OPEN',
          items: [{ id: 'item-new-1', menuItemId: 'menu-1', itemName: 'Burger', quantity: 1, notes: undefined }],
        }),
      );

      await service.addItems(ORG_ID, ORDER_ID, dto);

      expect(prisma.__tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OPEN', closedAt: null }),
        }),
      );
    });

    it('does not touch status when adding items to a plain OPEN order', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN', discountAmount: 0, subtotal: 5000 }));
      prisma.__tx.order.update.mockResolvedValue(
        orderWith({ status: 'OPEN', items: [{ id: 'item-new-1', menuItemId: 'menu-1', itemName: 'Burger', quantity: 1, notes: undefined }] }),
      );

      await service.addItems(ORG_ID, ORDER_ID, dto);

      const updateCall = prisma.__tx.order.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('status');
      expect(updateCall.data).not.toHaveProperty('closedAt');
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
