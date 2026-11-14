import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HeldSalesService } from './held-sales.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    heldSale: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    inventoryItem: { findMany: jest.fn() },
    customer: { findFirst: jest.fn() },
  };
}

const ORG = 'org-1';
const USER = 'user-1';
const MILK = '11111111-1111-4111-8111-111111111111';
const BREAD = '22222222-2222-4222-8222-222222222222';

describe('HeldSalesService', () => {
  let service: HeldSalesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeldSalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HeldSalesService);
  });

  describe('hold', () => {
    it('merges duplicate lines and snapshots name and price', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([{ id: MILK, name: 'Milk', sellPrice: 500 }]);
      prisma.heldSale.create.mockResolvedValue({ id: 'held-1' });

      const result = await service.hold(ORG, USER, {
        items: [
          { inventoryItemId: MILK, quantity: 1 },
          { inventoryItemId: MILK, quantity: 2 },
        ],
        label: '  blue jacket ',
      });

      expect(result).toEqual({ id: 'held-1' });
      const data = prisma.heldSale.create.mock.calls[0][0].data;
      expect(data.label).toBe('blue jacket');
      expect(data.items).toEqual([{ inventoryItemId: MILK, name: 'Milk', quantity: 3, unitPrice: 500 }]);
      expect(data.organizationId).toBe(ORG);
      expect(data.heldById).toBe(USER);
    });

    it('rejects an item that is not in this org', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([]);
      await expect(
        service.hold(ORG, USER, { items: [{ inventoryItemId: MILK, quantity: 1 }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.heldSale.create).not.toHaveBeenCalled();
    });

    it('rejects a customer from another org', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([{ id: MILK, name: 'Milk', sellPrice: 500 }]);
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.hold(ORG, USER, { items: [{ inventoryItemId: MILK, quantity: 1 }], customerId: BREAD }),
      ).rejects.toThrow('Customer not found');
    });

    it('refuses once the org already has the maximum parked', async () => {
      prisma.heldSale.count.mockResolvedValue(50);
      await expect(
        service.hold(ORG, USER, { items: [{ inventoryItemId: MILK, quantity: 1 }] }),
      ).rejects.toThrow(/already 50 held sales/);
    });
  });

  describe('findAll', () => {
    it('sweeps stale holds to EXPIRED before listing, scoped to the org', async () => {
      await service.findAll(ORG);
      const sweep = prisma.heldSale.updateMany.mock.calls[0][0];
      expect(sweep.where).toMatchObject({ organizationId: ORG, status: 'HELD' });
      expect(sweep.where.createdAt.lt).toBeInstanceOf(Date);
      expect(sweep.data.status).toBe('EXPIRED');
    });

    it('summarises each cart with item count, total and who held it', async () => {
      prisma.heldSale.findMany.mockResolvedValue([
        {
          id: 'h1',
          label: null,
          createdAt: new Date('2026-11-14T10:00:00Z'),
          heldBy: { firstName: 'Ada', lastName: 'Obi' },
          items: [
            { inventoryItemId: MILK, name: 'Milk', quantity: 2, unitPrice: 500 },
            { inventoryItemId: BREAD, name: 'Bread', quantity: 1, unitPrice: 800 },
          ],
        },
      ]);
      const [row] = await service.findAll(ORG);
      expect(row).toMatchObject({
        id: 'h1',
        itemCount: 3,
        total: 1800,
        heldByName: 'Ada Obi',
        preview: ['Milk', 'Bread'],
      });
    });
  });

  describe('recall', () => {
    it('claims the sale atomically, only while it is still HELD', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 1 });
      prisma.heldSale.findUniqueOrThrow.mockResolvedValue({
        id: 'h1',
        label: 'jacket',
        customerId: null,
        items: [{ inventoryItemId: MILK, name: 'Milk', quantity: 2, unitPrice: 500 }],
      });
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: MILK, name: 'Milk', sellPrice: 500, isActive: true },
      ]);

      await service.recall(ORG, USER, 'h1');

      expect(prisma.heldSale.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'h1', organizationId: ORG, status: 'HELD' },
        data: { status: 'RECALLED', recalledById: USER },
      });
    });

    it('tells the second cashier it is already picked up when the race is lost', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 0 });
      prisma.heldSale.findFirst.mockResolvedValue({ id: 'h1', status: 'RECALLED' });
      await expect(service.recall(ORG, USER, 'h1')).rejects.toThrow(ConflictException);
    });

    it('404s for a sale in another org or that never existed', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 0 });
      prisma.heldSale.findFirst.mockResolvedValue(null);
      await expect(service.recall(ORG, USER, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('re-prices from the current catalogue and flags changed or unsellable lines', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 1 });
      prisma.heldSale.findUniqueOrThrow.mockResolvedValue({
        id: 'h1',
        label: null,
        customerId: 'cust-1',
        items: [
          { inventoryItemId: MILK, name: 'Milk', quantity: 2, unitPrice: 500 },
          { inventoryItemId: BREAD, name: 'Bread', quantity: 1, unitPrice: 800 },
        ],
      });
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: MILK, name: 'Milk', sellPrice: 550, isActive: true },
        { id: BREAD, name: 'Bread', sellPrice: 800, isActive: false },
      ]);

      const result = await service.recall(ORG, USER, 'h1');

      expect(result.customerId).toBe('cust-1');
      expect(result.lines[0]).toMatchObject({ unitPrice: 550, heldUnitPrice: 500, priceChanged: true, unavailable: false });
      expect(result.lines[1]).toMatchObject({ priceChanged: false, unavailable: true });
    });
  });

  describe('discard', () => {
    it('marks a held sale DISCARDED, keeping the row for audit', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.discard(ORG, 'h1')).resolves.toEqual({ id: 'h1' });
      expect(prisma.heldSale.updateMany.mock.calls[0][0].data.status).toBe('DISCARDED');
    });

    it('will not discard a sale another till already picked up', async () => {
      prisma.heldSale.updateMany.mockResolvedValue({ count: 0 });
      prisma.heldSale.findFirst.mockResolvedValue({ id: 'h1', status: 'RECALLED' });
      await expect(service.discard(ORG, 'h1')).rejects.toThrow(ConflictException);
    });
  });
});
