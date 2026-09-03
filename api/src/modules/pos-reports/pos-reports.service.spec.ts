import { PosReportsService } from './pos-reports.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    order: { findMany: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ shiftStartTime: '00:00', shiftEndTime: '23:59' }) },
  };
}

const ORG_ID = 'org-abc-123';

describe('PosReportsService — item sales report aggregation', () => {
  let service: PosReportsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PosReportsService(prisma as unknown as PrismaService);
  });

  it('aggregates sales/quantity by category and by product, with correct percentages', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        items: [
          {
            itemName: 'Jollof Rice',
            quantity: 2,
            amount: 6000,
            menuItem: { categories: [{ category: { name: 'Eat Up' } }] },
          },
          {
            itemName: 'Coke',
            quantity: 1,
            amount: 1000,
            menuItem: { categories: [{ category: { name: 'Soft Drinks' } }] },
          },
        ],
        payments: [{ recordedBy: { firstName: 'Ada', lastName: 'Obi' } }],
      },
      {
        id: 'order-2',
        items: [
          {
            itemName: 'Jollof Rice',
            quantity: 1,
            amount: 3000,
            menuItem: { categories: [{ category: { name: 'Eat Up' } }] },
          },
        ],
        payments: [{ recordedBy: { firstName: 'Ada', lastName: 'Obi' } }],
      },
    ]);

    const report = await service.getItemSalesReport(ORG_ID, '2026-08-12', '2026-08-12');

    expect(report.orders).toBe(2);
    expect(report.totalSales).toBe(10000);
    expect(report.totalQuantity).toBe(4);
    expect(report.cashiers).toEqual(['Ada Obi']);

    expect(report.salesByCategory).toEqual([
      { category: 'Eat Up', amount: 9000, percent: 90 },
      { category: 'Soft Drinks', amount: 1000, percent: 10 },
    ]);
    expect(report.quantitiesByCategory).toEqual([
      { category: 'Eat Up', quantity: 3, percent: 75 },
      { category: 'Soft Drinks', quantity: 1, percent: 25 },
    ]);
    expect(report.products).toEqual([
      { name: 'Jollof Rice', quantity: 3, amount: 9000 },
      { name: 'Coke', quantity: 1, amount: 1000 },
    ]);
  });

  it('falls back to "Uncategorized" for items with no menu category, and returns zeroes for an empty range', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        items: [{ itemName: 'Mystery Item', quantity: 1, amount: 500, menuItem: null }],
        payments: [],
      },
    ]);

    const report = await service.getItemSalesReport(ORG_ID, '2026-08-12');

    expect(report.to).toBe('2026-08-12');
    expect(report.salesByCategory).toEqual([{ category: 'Uncategorized', amount: 500, percent: 100 }]);
    expect(report.cashiers).toEqual([]);
  });

  it('returns zeroed totals with no percentage division-by-zero when there are no orders', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const report = await service.getItemSalesReport(ORG_ID, '2026-08-12', '2026-08-13');

    expect(report.orders).toBe(0);
    expect(report.totalSales).toBe(0);
    expect(report.salesByCategory).toEqual([]);
    expect(report.products).toEqual([]);
  });
});
