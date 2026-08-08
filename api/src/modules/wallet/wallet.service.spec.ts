import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  const prismaInstance: any = {
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Test', lastName: 'User' }),
    },
    walletTransaction: {
      create: jest.fn((args: any) => ({ id: 'wt-1', createdAt: new Date('2026-01-01'), ...args.data })),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    idempotencyKey: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prismaInstance.$transaction.mockImplementation((cb: any) => cb(prismaInstance));
  return prismaInstance;
}

function createMockSheetSync() {
  return { enqueue: jest.fn() };
}

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CUSTOMER_ID = 'customer-1';

function mockCustomer(walletBalance: string, creditLimit = '0') {
  return { id: CUSTOMER_ID, organizationId: ORG_ID, walletBalance, creditLimit };
}

describe('WalletService', () => {
  let service: WalletService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new WalletService(prisma as unknown as PrismaService, createMockSheetSync() as any);
  });

  describe('topUp', () => {
    it('credits the wallet and returns balanceAfter = balanceBefore + amount', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('100'));

      const result = await service.topUp(ORG_ID, CUSTOMER_ID, USER_ID, {
        amount: 50,
        paymentMethod: 'CASH',
        clientRequestId: 'req-1',
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { walletBalance: 150 },
      });
      expect(result).toMatchObject({
        type: 'TOPUP',
        amount: 50,
        balanceBefore: 100,
        balanceAfter: 150,
      });
    });

    it('is idempotent for a repeated clientRequestId', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('100'));
      const snapshot = { type: 'TOPUP', amount: 50, balanceBefore: 100, balanceAfter: 150 };

      prisma.$transaction.mockImplementationOnce(async () => {
        const error: any = new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'x',
        });
        throw error;
      });
      prisma.idempotencyKey.findUnique.mockResolvedValue({ resultSnapshot: snapshot });

      const result = await service.topUp(ORG_ID, CUSTOMER_ID, USER_ID, {
        amount: 50,
        paymentMethod: 'CASH',
        clientRequestId: 'req-1',
      });

      expect(result).toEqual(snapshot);
    });

    it('throws 409 when the key is in-flight with no snapshot yet', async () => {
      prisma.$transaction.mockImplementationOnce(async () => {
        const error: any = new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'x',
        });
        throw error;
      });
      prisma.idempotencyKey.findUnique.mockResolvedValue({ resultSnapshot: null });

      await expect(
        service.topUp(ORG_ID, CUSTOMER_ID, USER_ID, {
          amount: 50,
          paymentMethod: 'CASH',
          clientRequestId: 'req-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('adjust', () => {
    it('allows a negative signed amount to push the balance further negative', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('-20'));

      const result = await service.adjust(ORG_ID, CUSTOMER_ID, USER_ID, {
        amount: -30,
        reason: 'correcting a miscounted tab',
        clientRequestId: 'req-2',
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { walletBalance: -50 },
      });
      expect(result).toMatchObject({ type: 'ADJUSTMENT', balanceBefore: -20, balanceAfter: -50 });
    });
  });

  describe('debit (order settlement path)', () => {
    it('debits within an approved credit limit, allowing the balance to go negative', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('10', '50'));

      const result = await service.debit(prisma, ORG_ID, CUSTOMER_ID, USER_ID, {
        amount: 45,
        type: 'ORDER_DEBIT',
        orderId: 'order-1',
        paymentId: 'payment-1',
      });

      expect(result).toMatchObject({
        type: 'ORDER_DEBIT',
        amount: -45,
        balanceBefore: 10,
        balanceAfter: -35,
        orderId: 'order-1',
        paymentId: 'payment-1',
      });
    });

    it('rejects a payment that would exceed the customer\'s credit limit', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('10', '20'));

      await expect(
        service.debit(prisma, ORG_ID, CUSTOMER_ID, USER_ID, { amount: 45, type: 'ORDER_DEBIT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('rejects a payment that goes negative with no credit limit approved', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('10'));

      await expect(
        service.debit(prisma, ORG_ID, CUSTOMER_ID, USER_ID, { amount: 45, type: 'ORDER_DEBIT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the customer does not belong to the organization', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.debit(prisma, ORG_ID, CUSTOMER_ID, USER_ID, { amount: 10, type: 'ORDER_DEBIT' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getBalance', () => {
    it('returns the numeric balance and credit limit for an existing customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer('75.50', '20'));

      const result = await service.getBalance(ORG_ID, CUSTOMER_ID);

      expect(result).toEqual({ customerId: CUSTOMER_ID, balance: 75.5, creditLimit: 20 });
    });

    it('throws NotFoundException for an unknown customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.getBalance(ORG_ID, CUSTOMER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
