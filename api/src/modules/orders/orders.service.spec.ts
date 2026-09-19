import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { SheetSyncService } from '../sheet-sync';
import { PrintingService } from '../printers';
import { OrderTypesService } from '../order-types';
import { PaymentTypesService } from '../payment-types';

// ─── Mock helpers ────────────────────────────────────────────────────────────

type TxMock = ReturnType<typeof createTxMock>;

function createTxMock() {
  return {
    order: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    orderItem: {
      create: jest.fn(),
      // recomputeOrderTotals always re-derives subtotal from this — defaults to "no rows"
      // rather than throwing, so tests that don't care about the exact total (most of them)
      // don't need to stub it explicitly.
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      count: jest.fn().mockResolvedValue(0),
    },
    restaurantTable: { update: jest.fn() },
    payment: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    // Only reassignPayment reads these directly (WalletService itself is mocked wholesale, so
    // its own tx.customer/tx.walletTransaction usage never reaches this mock).
    customer: { findFirst: jest.fn() },
    walletTransaction: { findMany: jest.fn() },
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
  let walletService: { debit: jest.Mock; credit: jest.Mock };
  let sheetSync: { enqueue: jest.Mock; enqueueMany: jest.Mock };
  let printingService: { dispatchDocketsForNewItems: jest.Mock; dispatchDocketsForCancellation: jest.Mock };
  let orderTypesService: { requiresTable: jest.Mock };
  let paymentTypesService: { exists: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    inventoryService = { deductForOrder: jest.fn() };
    walletService = { debit: jest.fn(), credit: jest.fn() };
    sheetSync = { enqueue: jest.fn(), enqueueMany: jest.fn() };
    printingService = {
      dispatchDocketsForNewItems: jest.fn().mockResolvedValue(undefined),
      dispatchDocketsForCancellation: jest.fn().mockResolvedValue(undefined),
    };
    // Only create/setSource/moveItems consult this — defaults to "Dine In behaves like the old
    // DINE_IN enum value" for any test that happens to exercise those paths.
    orderTypesService = { requiresTable: jest.fn().mockResolvedValue(false) };
    // Only closeWithPayment consults this — defaults to "any payment method is valid" so
    // existing tests don't need to know about it unless they're testing this specifically.
    paymentTypesService = { exists: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventoryService },
        { provide: WalletService, useValue: walletService },
        { provide: SheetSyncService, useValue: sheetSync },
        { provide: PrintingService, useValue: printingService },
        { provide: OrderTypesService, useValue: orderTypesService },
        { provide: PaymentTypesService, useValue: paymentTypesService },
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

    it('rejects a paymentMethod that is not an active PaymentType for the org', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith({ status: 'OPEN' }));
      paymentTypesService.exists.mockResolvedValue(false);

      await expect(
        service.closeWithPayment(ORG_ID, ORDER_ID, USER_ID, { ...dto, paymentMethod: 'CRYPTO' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.__tx.payment.create).not.toHaveBeenCalled();
    });
  });

  // ─── reassignPayment (wallet payment misattribution correction) ────────────

  describe('reassignPayment', () => {
    const FROM_CUSTOMER_ID = 'customer-a';
    const TO_CUSTOMER_ID = 'customer-b';
    const dto = {
      toCustomerId: TO_CUSTOMER_ID,
      reason: 'Cashier had the wrong customer selected',
      clientRequestId: 'req-reassign-1',
    };

    function walletDebitWith(overrides: object) {
      return {
        id: 'wallet-txn-1',
        organizationId: ORG_ID,
        customerId: FROM_CUSTOMER_ID,
        orderId: ORDER_ID,
        type: 'ORDER_DEBIT',
        amount: -5000,
        paymentId: 'payment-old-1',
        ...overrides,
      };
    }

    beforeEach(() => {
      prisma.__tx.order.findFirst.mockResolvedValue(orderWith({ customerId: FROM_CUSTOMER_ID }));
      prisma.__tx.customer.findFirst.mockResolvedValue({ id: TO_CUSTOMER_ID, organizationId: ORG_ID });
      prisma.__tx.walletTransaction.findMany.mockResolvedValue([walletDebitWith({})]);
      prisma.__tx.payment.create.mockResolvedValue({ id: 'payment-new-1', amount: 5000, paymentMethod: 'WALLET' });
      prisma.__tx.order.findUniqueOrThrow.mockResolvedValue(orderWith({ customerId: TO_CUSTOMER_ID }));
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.__tx.order.findFirst.mockResolvedValue(null);
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an order with no customer to reassign the payment from', async () => {
      prisma.__tx.order.findFirst.mockResolvedValue(orderWith({ customerId: null }));
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects reassigning to the customer the order is already attributed to', async () => {
      prisma.__tx.order.findFirst.mockResolvedValue(orderWith({ customerId: TO_CUSTOMER_ID }));
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the target customer does not exist', async () => {
      prisma.__tx.customer.findFirst.mockResolvedValue(null);
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an order that was never paid from a wallet', async () => {
      prisma.__tx.walletTransaction.findMany.mockResolvedValue([]);
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it('rejects an order with more than one wallet charge against the current customer', async () => {
      prisma.__tx.walletTransaction.findMany.mockResolvedValue([walletDebitWith({}), walletDebitWith({ id: 'wallet-txn-2' })]);
      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it('refunds the original customer, re-attributes the order, and charges the correct customer', async () => {
      const result = await service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto);

      // 1. The wrongly-charged customer is refunded the exact debited amount, referencing the
      // original debit for audit purposes.
      expect(walletService.credit).toHaveBeenCalledWith(
        prisma.__tx,
        ORG_ID,
        FROM_CUSTOMER_ID,
        USER_ID,
        expect.objectContaining({
          amount: 5000,
          type: 'REFUND',
          orderId: ORDER_ID,
          paymentId: 'payment-old-1',
          reference: 'wallet-txn-1',
        }),
      );

      // 2. The order is re-attributed to the correct customer.
      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { customerId: TO_CUSTOMER_ID },
      });

      // 3. A new payment record is created and the correct customer is charged for it.
      expect(prisma.__tx.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            orderId: ORDER_ID,
            recordedById: USER_ID,
            amount: 5000,
            paymentMethod: 'WALLET',
          }),
        }),
      );
      expect(walletService.debit).toHaveBeenCalledWith(
        prisma.__tx,
        ORG_ID,
        TO_CUSTOMER_ID,
        USER_ID,
        expect.objectContaining({
          amount: 5000,
          type: 'ORDER_DEBIT',
          orderId: ORDER_ID,
          paymentId: 'payment-new-1',
          notes: dto.reason,
        }),
      );

      expect(result).toMatchObject({ customerId: TO_CUSTOMER_ID });
    });

    it('rolls back the whole correction when the correct customer lacks balance/credit to cover it', async () => {
      walletService.debit.mockRejectedValue(
        new BadRequestException('This customer does not have enough wallet balance or approved credit to cover this payment'),
      );

      await expect(service.reassignPayment(ORG_ID, ORDER_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);

      // The refund and re-attribution were attempted before the failing debit — a real
      // transaction rolls all of this back atomically, which this unit test can't observe
      // directly (the tx mock has no rollback semantics), but it documents the ordering: the
      // failure happens on step 3, after steps 1 and 2 already ran within the same tx.
      expect(walletService.credit).toHaveBeenCalled();
      expect(prisma.__tx.order.update).toHaveBeenCalled();
    });
  });
});
