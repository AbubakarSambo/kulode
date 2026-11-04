import { buildSalesReport, ReportLine, ReportOrder } from './sales-report.builder';
import { comparisonRange, mostSpecificCategory } from './sales-report.service';

const line = (itemKey: string, category: string, department: ReportLine['department'], quantity: number, amount: number): ReportLine => ({
  itemKey,
  itemName: itemKey.toUpperCase(),
  category,
  department,
  quantity,
  amount,
});

const order = (hour: number, lines: ReportLine[], extra: Partial<ReportOrder> = {}): ReportOrder => ({
  placedAt: new Date(2026, 10, 1, hour, 30),
  orderType: 'Dine In',
  staffId: 'u1',
  discountAmount: 0,
  lines,
  payments: [{ method: 'CASH', amount: lines.reduce((s, l) => s + l.amount, 0) }],
  ...extra,
});

describe('buildSalesReport', () => {
  const orders = [
    order(8, [line('rice', 'Mains', 'FOOD', 2, 6000), line('coke', 'Cold Drinks', 'DRINK', 1, 1000)]),
    order(13, [line('rice', 'Mains', 'FOOD', 1, 3000)], { discountAmount: 500, staffId: 'u2', orderType: 'Takeaway' }),
    order(23, [line('beer', 'Beer', 'DRINK', 3, 4500), line('wings', 'Sides', 'FOOD', 1, 2500)], {
      payments: [
        { method: 'TRANSFER', amount: 4000 },
        { method: 'CASH', amount: 3000 },
      ],
    }),
  ];
  const report = buildSalesReport({
    orders,
    voids: [{ staffId: 'u2', amount: 2000 }],
    catalog: [
      { itemKey: 'rice', department: 'FOOD' },
      { itemKey: 'wings', department: 'FOOD' },
      { itemKey: 'soup', department: 'FOOD' },
      { itemKey: 'coke', department: 'DRINK' },
      { itemKey: 'beer', department: 'DRINK' },
      { itemKey: 'wine', department: 'DRINK' },
      { itemKey: 'zobo', department: 'DRINK' },
    ],
    staffNames: new Map([
      ['u1', 'Ada Obi'],
      ['u2', 'Bayo Ade'],
    ]),
  });

  it('computes gross, discounts, net and the per-order headline numbers', () => {
    expect(report.headline).toEqual({
      grossSales: 17000,
      discounts: 500,
      netSales: 16500,
      orders: 3,
      avgCheck: 5666.67,
      itemsSold: 8,
      itemsPerOrder: 2.67,
    });
  });

  it('rolls categories up into departments that sum to the grand total', () => {
    const food = report.departments.find((d) => d.key === 'FOOD')!;
    const drink = report.departments.find((d) => d.key === 'DRINK')!;
    expect(food).toMatchObject({ name: 'Kitchen', quantity: 4, revenue: 11500, avgPrice: 2875 });
    expect(drink).toMatchObject({ name: 'Bar', quantity: 4, revenue: 5500 });
    expect(food.revenue + drink.revenue).toBe(report.totals.revenue);
    expect(food.categories.map((c) => c.name)).toEqual(['Mains', 'Sides']);
    expect(report.departments[0].key).toBe('FOOD');
  });

  it('counts menu items that sold nothing, per department', () => {
    expect(report.departments.find((d) => d.key === 'FOOD')!.zeroSalesCount).toBe(1);
    expect(report.departments.find((d) => d.key === 'DRINK')!.zeroSalesCount).toBe(2);
  });

  it('never lists a top-5 item in the bottom 5', () => {
    const food = report.departments.find((d) => d.key === 'FOOD')!;
    expect(food.topItems.map((i) => i.name)).toEqual(['RICE', 'WINGS']);
    expect(food.bottomItems).toEqual([]);
  });

  it('buckets orders into dayparts, with Late crossing midnight', () => {
    const byName = Object.fromEntries(report.dayparts.map((d) => [d.name, d]));
    expect(byName.Breakfast).toMatchObject({ orders: 1, sales: 7000 });
    expect(byName.Lunch).toMatchObject({ orders: 1, sales: 3000 });
    expect(byName.Late).toMatchObject({ orders: 1, sales: 7000 });
  });

  it('splits order types, payments and staff', () => {
    expect(report.orderTypes).toEqual([
      { name: 'Dine In', orders: 2, sales: 14000, salesPercent: 82.35 },
      { name: 'Takeaway', orders: 1, sales: 3000, salesPercent: 17.65 },
    ]);
    expect(report.payments.methods.find((m) => m.method === 'CASH')!.amount).toBe(13000);
    const bayo = report.staff.find((s) => s.name === 'Bayo Ade')!;
    expect(bayo).toMatchObject({ orders: 1, sales: 3000, voids: 1, voidAmount: 2000, discounts: 500 });
  });

  it('reports voids beside gross sales without deducting them', () => {
    expect(report.controls.voids).toEqual({ amount: 2000, count: 1, percentOfSales: 11.76 });
    expect(report.controls.discounts).toEqual({ amount: 500, count: 1 });
  });

  it('shows the bottom 5 from items beyond the top 5', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`i${i}`, 'C', 'FOOD', 1, (i + 1) * 100));
    const r = buildSalesReport({ orders: [order(12, lines)], voids: [], catalog: [], staffNames: new Map() });
    const dept = r.departments[0];
    expect(dept.topItems.map((i) => i.revenue)).toEqual([1200, 1100, 1000, 900, 800]);
    expect(dept.bottomItems.map((i) => i.revenue)).toEqual([100, 200, 300, 400, 500]);
  });
});

describe('comparisonRange', () => {
  it('compares a single day with the same weekday last week', () => {
    expect(comparisonRange('2026-11-04', '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-10-28', label: 'same weekday last week' });
  });

  it('compares month-to-date with the same dates last month', () => {
    expect(comparisonRange('2026-11-01', '2026-11-04', 'month')).toMatchObject({ from: '2026-10-01', to: '2026-10-04' });
    expect(comparisonRange('2026-03-01', '2026-03-31')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('compares a week with the week before, even one starting on the 1st', () => {
    expect(comparisonRange('2026-11-01', '2026-11-07', 'week')).toMatchObject({ from: '2026-10-25', to: '2026-10-31' });
    expect(comparisonRange('2026-11-01', '2026-11-07')).toMatchObject({ from: '2026-10-25', to: '2026-10-31' });
  });

  it('compares a long range with the equally long period before it', () => {
    expect(comparisonRange('2026-10-10', '2026-10-29')).toEqual({ from: '2026-09-20', to: '2026-10-09', label: 'previous 20 days' });
  });
});

describe('mostSpecificCategory', () => {
  it('picks the category with the fewest items over a broad one', () => {
    const kitchen = { name: 'Kitchen', department: 'FOOD' as const, size: 120, sortOrder: 0 };
    const eatUp = { name: 'Eat Up!', department: 'FOOD' as const, size: 14, sortOrder: 5 };
    expect(mostSpecificCategory([kitchen, eatUp])).toBe(eatUp);
    expect(mostSpecificCategory([eatUp, kitchen])).toBe(eatUp);
    expect(mostSpecificCategory([undefined])).toBeUndefined();
  });
});
