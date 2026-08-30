import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    shift: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payment: { groupBy: jest.fn() },
    shiftPaymentBreakdown: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // close() uses the array form of $transaction, not the callback form — just resolve
    // whatever promises were handed in, in order.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

const ORG_ID = 'org-abc-123';
const SHIFT_ID = 'shift-xyz-789';
const USER_ID = 'user-cashier-1';

function shiftWith(overrides: object) {
  return {
    id: SHIFT_ID,
    organizationId: ORG_ID,
    status: 'OPEN',
    openingFloat: 20000,
    openedById: USER_ID,
    openedAt: new Date('2026-08-30T19:00:00.000Z'),
    ...overrides,
  };
}

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ShiftsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
  });

  // ─── open ──────────────────────────────────────────────────────────────────

  describe('open', () => {
    it('throws BadRequestException when a shift is already open for the org', async () => {
      prisma.shift.findFirst.mockResolvedValue(shiftWith({}));
      await expect(service.open(ORG_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('defaults openingFloat to 0 when not provided', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      prisma.shift.create.mockResolvedValue(shiftWith({ openingFloat: 0 }));

      await service.open(ORG_ID, USER_ID, {});

      expect(prisma.shift.create).toHaveBeenCalledWith({
        data: { organizationId: ORG_ID, openedById: USER_ID, openingFloat: 0 },
      });
    });

    it('creates a shift with the given openingFloat', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      prisma.shift.create.mockResolvedValue(shiftWith({ openingFloat: 15000 }));

      await service.open(ORG_ID, USER_ID, { openingFloat: 15000 });

      expect(prisma.shift.create).toHaveBeenCalledWith({
        data: { organizationId: ORG_ID, openedById: USER_ID, openingFloat: 15000 },
      });
    });
  });

  // ─── previewClose ────────────────────────────────────────────────────────────

  describe('previewClose', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.previewClose(ORG_ID, SHIFT_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the shift is already closed', async () => {
      prisma.shift.findFirst.mockResolvedValue(shiftWith({ status: 'CLOSED' }));
      await expect(service.previewClose(ORG_ID, SHIFT_ID)).rejects.toThrow(BadRequestException);
    });

    it('returns the opening float plus a live per-method breakdown, defaulting CASH to 0', async () => {
      prisma.shift.findFirst.mockResolvedValue(shiftWith({ openingFloat: 20000 }));
      prisma.payment.groupBy.mockResolvedValue([
        { paymentMethod: 'Card (Moniepoint)', _sum: { amount: 2769150.35 } },
      ]);

      const result = await service.previewClose(ORG_ID, SHIFT_ID);

      expect(result.openingFloat).toBe(20000);
      expect(result.breakdown).toEqual([
        { paymentMethod: 'CASH', expectedAmount: 0 },
        { paymentMethod: 'Card (Moniepoint)', expectedAmount: 2769150.35 },
      ]);
    });
  });

  // ─── close ───────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 0 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the shift is already closed', async () => {
      prisma.shift.findFirst.mockResolvedValue(shiftWith({ status: 'CLOSED' }));
      await expect(service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 0 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('computes expectedCash from opening float + cash sales, and variance against countedCash', async () => {
      prisma.shift.findFirst.mockResolvedValue(shiftWith({ openingFloat: 20000 }));
      prisma.payment.groupBy.mockResolvedValue([{ paymentMethod: 'CASH', _sum: { amount: 108000 } }]);
      prisma.shift.update.mockResolvedValue(shiftWith({ status: 'CLOSED' }));
      // findOne's re-fetch at the end of close()
      prisma.shift.findFirst.mockResolvedValueOnce(shiftWith({ openingFloat: 20000 })).mockResolvedValueOnce(
        shiftWith({ status: 'CLOSED' }),
      );

      await service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 127800 });

      // expectedCash = 20000 (float) + 108000 (cash sales) = 128000; variance = 127800 - 128000 = -200
      expect(prisma.shift.update).toHaveBeenCalledWith({
        where: { id: SHIFT_ID },
        data: expect.objectContaining({
          status: 'CLOSED',
          closedById: USER_ID,
          expectedCash: 128000,
          countedCash: 127800,
          variance: -200,
        }),
      });
    });

    it('defaults a CASH breakdown row to 0 expected when there were no cash payments', async () => {
      prisma.shift.findFirst
        .mockResolvedValueOnce(shiftWith({ openingFloat: 20000 }))
        .mockResolvedValueOnce(shiftWith({ status: 'CLOSED' }));
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.shift.update.mockResolvedValue(shiftWith({ status: 'CLOSED' }));

      await service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 20000 });

      expect(prisma.shiftPaymentBreakdown.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            paymentMethod: 'CASH',
            expectedAmount: 20000,
            countedAmount: 20000,
            variance: 0,
          }),
        ],
      });
    });

    it('defaults non-cash methods to their expected amount (zero variance) when not overridden', async () => {
      prisma.shift.findFirst
        .mockResolvedValueOnce(shiftWith({ openingFloat: 0 }))
        .mockResolvedValueOnce(shiftWith({ status: 'CLOSED' }));
      prisma.payment.groupBy.mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { amount: 0 } },
        { paymentMethod: 'Card (Moniepoint)', _sum: { amount: 2769150.35 } },
        { paymentMethod: 'Transfer (Moniepoint)', _sum: { amount: 4167041.44 } },
      ]);
      prisma.shift.update.mockResolvedValue(shiftWith({ status: 'CLOSED' }));

      await service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 0 });

      expect(prisma.shiftPaymentBreakdown.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ paymentMethod: 'CASH', expectedAmount: 0, countedAmount: 0, variance: 0 }),
          expect.objectContaining({
            paymentMethod: 'Card (Moniepoint)',
            expectedAmount: 2769150.35,
            countedAmount: 2769150.35,
            variance: 0,
          }),
          expect.objectContaining({
            paymentMethod: 'Transfer (Moniepoint)',
            expectedAmount: 4167041.44,
            countedAmount: 4167041.44,
            variance: 0,
          }),
        ],
      });
    });

    it('applies an explicit countedAmounts override for a non-cash method and computes its variance', async () => {
      prisma.shift.findFirst
        .mockResolvedValueOnce(shiftWith({ openingFloat: 0 }))
        .mockResolvedValueOnce(shiftWith({ status: 'CLOSED' }));
      prisma.payment.groupBy.mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { amount: 0 } },
        { paymentMethod: 'Card (Moniepoint)', _sum: { amount: 2769150.35 } },
      ]);
      prisma.shift.update.mockResolvedValue(shiftWith({ status: 'CLOSED' }));

      await service.close(ORG_ID, SHIFT_ID, USER_ID, {
        countedCash: 0,
        countedAmounts: { 'Card (Moniepoint)': 2750000 },
      });

      expect(prisma.shiftPaymentBreakdown.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ paymentMethod: 'CASH', expectedAmount: 0, countedAmount: 0, variance: 0 }),
          expect.objectContaining({
            paymentMethod: 'Card (Moniepoint)',
            expectedAmount: 2769150.35,
            countedAmount: 2750000,
          }),
        ],
      });
      const cardRow = prisma.shiftPaymentBreakdown.createMany.mock.calls[0][0].data[1];
      expect(cardRow.variance).toBeCloseTo(-19150.35, 2);
    });

    it('clears any prior breakdown rows for the shift before writing the new ones', async () => {
      prisma.shift.findFirst
        .mockResolvedValueOnce(shiftWith({ openingFloat: 0 }))
        .mockResolvedValueOnce(shiftWith({ status: 'CLOSED' }));
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.shift.update.mockResolvedValue(shiftWith({ status: 'CLOSED' }));

      await service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 0 });

      expect(prisma.shiftPaymentBreakdown.deleteMany).toHaveBeenCalledWith({ where: { shiftId: SHIFT_ID } });
    });

    it('returns the freshly closed shift with its breakdowns via findOne', async () => {
      const closed = shiftWith({ status: 'CLOSED' });
      prisma.shift.findFirst
        .mockResolvedValueOnce(shiftWith({ openingFloat: 0 }))
        .mockResolvedValueOnce(closed);
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.shift.update.mockResolvedValue(closed);

      const result = await service.close(ORG_ID, SHIFT_ID, USER_ID, { countedCash: 0 });

      expect(result).toBe(closed);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, SHIFT_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns the shift when found', async () => {
      const shift = shiftWith({});
      prisma.shift.findFirst.mockResolvedValue(shift);
      await expect(service.findOne(ORG_ID, SHIFT_ID)).resolves.toBe(shift);
    });
  });
});
