import { DEPARTMENTS, LOW_STOCK_NAMES, PHARMACY_PRICE_CHANGE, PRODUCTS, EXPIRY_WRITE_OFFS } from './pharmacy.constants';
import { addDays, createRng } from './demo-plan';
import {
  StockSale,
  pharmacyClosingTime,
  pharmacyCumulativeShare,
  pharmacyDayKey,
  pharmacyOpeningTime,
  pharmacyOrderCount,
  pharmacySaleTime,
  pickPharmacyPaymentKind,
  planPharmacyBasket,
  planStockMovements,
} from './pharmacy-plan';

describe('pharmacy catalogue', () => {
  it('has unique names, barcodes and SKUs', () => {
    expect(new Set(PRODUCTS.map((p) => p.name)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((p) => p.barcode)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((p) => p.sku)).size).toBe(PRODUCTS.length);
  });

  it('uses valid EAN-13 barcodes in the in-store range', () => {
    for (const { barcode } of PRODUCTS) {
      expect(barcode).toMatch(/^2\d{12}$/);
      const sum = [...barcode.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
      expect(Number(barcode[12])).toBe((10 - (sum % 10)) % 10);
    }
  });

  it('sells every product above cost, at a sane margin', () => {
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(p.cost);
      expect(p.price / p.cost).toBeLessThan(1.8);
    }
  });

  it('keeps a handful of items short on purpose, not most of the shelf', () => {
    expect(LOW_STOCK_NAMES.size).toBeGreaterThanOrEqual(5);
    expect(LOW_STOCK_NAMES.size).toBeLessThanOrEqual(10);
  });

  it('mixes VAT categories — exempt medicines, standard-rated goods', () => {
    const categories = new Set(PRODUCTS.map((p) => p.vatCategory));
    expect(categories).toEqual(new Set(['EXEMPT', 'STANDARD']));
  });

  it('refers to real products in the price change and write-offs', () => {
    const names = new Set(PRODUCTS.map((p) => p.name));
    const price = new Map(PRODUCTS.map((p) => [p.name, p.price]));
    expect(names.has(PHARMACY_PRICE_CHANGE.itemName)).toBe(true);
    expect(price.get(PHARMACY_PRICE_CHANGE.itemName)).toBeGreaterThan(PHARMACY_PRICE_CHANGE.oldPrice);
    for (const [name] of EXPIRY_WRITE_OFFS) expect(names.has(name)).toBe(true);
  });
});

describe('pharmacy clock', () => {
  it('opens at 08:00 and closes at 22:00 Lagos time (UTC+1) on the same date', () => {
    expect(pharmacyOpeningTime('2026-11-10').toISOString()).toBe('2026-11-10T07:00:00.000Z');
    expect(pharmacyClosingTime('2026-11-10').toISOString()).toBe('2026-11-10T21:00:00.000Z');
  });

  it('names the business day by the Lagos date', () => {
    expect(pharmacyDayKey(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-10');
    expect(pharmacyDayKey(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11');
  });

  it('puts every sale inside opening hours', () => {
    const rng = createRng(1);
    const key = '2026-11-10';
    for (let i = 0; i < 500; i++) {
      const at = pharmacySaleTime(rng, key);
      expect(at.getTime()).toBeGreaterThanOrEqual(pharmacyOpeningTime(key).getTime());
      expect(at.getTime()).toBeLessThanOrEqual(pharmacyClosingTime(key).getTime());
    }
  });

  it('reaches the full day by closing and nothing before opening', () => {
    const key = '2026-11-10';
    expect(pharmacyCumulativeShare(key, new Date(pharmacyOpeningTime(key).getTime() - 1))).toBe(0);
    expect(pharmacyCumulativeShare(key, pharmacyClosingTime(key))).toBeCloseTo(1, 5);
    expect(pharmacyCumulativeShare(key, new Date('2026-11-10T13:00:00Z'))).toBeGreaterThan(0.4);
  });
});

describe('pharmacy volume and baskets', () => {
  it('plans a deterministic, busy-pharmacy number of sales a day, quieter on Sundays', () => {
    expect(pharmacyOrderCount('2026-11-10', 0)).toBe(pharmacyOrderCount('2026-11-10', 0));
    const monday = pharmacyOrderCount('2026-11-09', 0);
    const sunday = pharmacyOrderCount('2026-11-15', 0);
    expect(monday).toBeGreaterThan(90);
    expect(monday).toBeLessThan(150);
    expect(sunday).toBeLessThan(monday);
  });

  it('builds small baskets of known products at shelf price', () => {
    const price = new Map(PRODUCTS.map((p) => [p.name, p.price]));
    const rng = createRng(7);
    let lines = 0;
    let totalValue = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const basket = planPharmacyBasket(rng);
      expect(basket.length).toBeGreaterThanOrEqual(1);
      expect(basket.length).toBeLessThanOrEqual(5);
      for (const line of basket) {
        expect(price.get(line.name)).toBe(line.price);
        expect(line.quantity).toBeGreaterThanOrEqual(1);
      }
      lines += basket.length;
      totalValue += basket.reduce((s, l) => s + l.price * l.quantity, 0);
    }
    expect(lines / runs).toBeGreaterThan(1.5);
    expect(lines / runs).toBeLessThan(2.6);
    // A typical Abuja pharmacy sale: a few thousand naira.
    expect(totalValue / runs).toBeGreaterThan(3000);
    expect(totalValue / runs).toBeLessThan(12000);
  });

  it('sells across every department', () => {
    const rng = createRng(3);
    const departments = new Set<string>();
    const dept = new Map(DEPARTMENTS.flatMap((d) => d.items.map(([name]) => [name, d.name] as const)));
    for (let i = 0; i < 3000; i++) for (const l of planPharmacyBasket(rng)) departments.add(dept.get(l.name)!);
    expect(departments.size).toBe(DEPARTMENTS.length);
  });

  it('only offers the wallet when it is allowed', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) expect(pickPharmacyPaymentKind(rng, false)).not.toBe('WALLET');
    const kinds = new Set(Array.from({ length: 500 }, () => pickPharmacyPaymentKind(rng, true)));
    expect(kinds.has('WALLET')).toBe(true);
    expect(kinds.has('CASH')).toBe(true);
  });
});

describe('planStockMovements', () => {
  const now = new Date('2026-11-10T14:00:00Z');
  const windowDays = 30;
  const todayKey = pharmacyDayKey(now);

  function simulate(finalOnHand: number, perDay: number, lowStock = false) {
    const sales: StockSale[] = [];
    for (let d = windowDays; d >= 0; d--) {
      const key = addDays(todayKey, -d);
      for (let i = 0; i < perDay; i++) {
        const at = new Date(pharmacyOpeningTime(key).getTime() + (i + 1) * 20 * 60_000);
        if (at < now) sales.push({ itemId: 'item', at, quantity: 1 + (i % 2), orderId: `${key}-${i}` });
      }
    }
    const movements = planStockMovements([{ id: 'item', name: 'Paracetamol', finalOnHand, lowStock }], sales, [], now, windowDays);
    return { sales, movements };
  }

  it('chains every movement end to end and finishes on the final on-hand', () => {
    const { movements } = simulate(200, 4);
    expect(movements.length).toBeGreaterThan(0);
    for (let i = 1; i < movements.length; i++) {
      expect(movements[i].onHandBefore).toBe(movements[i - 1].onHandAfter);
      expect(movements[i].at.getTime()).toBeGreaterThanOrEqual(movements[i - 1].at.getTime());
    }
    expect(movements[movements.length - 1].onHandAfter).toBe(200);
  });

  it('keeps every movement internally consistent and never lets stock go negative', () => {
    const { movements } = simulate(5, 6);
    for (const m of movements) {
      expect(m.onHandAfter - m.onHandBefore).toBe(m.quantity);
      expect(m.onHandBefore).toBeGreaterThanOrEqual(0);
      expect(m.onHandAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it('records each sale as a negative movement against its order', () => {
    const { sales, movements } = simulate(200, 3);
    const deductions = movements.filter((m) => m.type === 'ORDER_DEDUCTED');
    expect(deductions).toHaveLength(sales.length);
    for (const m of deductions) {
      expect(m.quantity).toBeLessThan(0);
      expect(m.orderId).toBeDefined();
    }
  });

  it('adds supplier deliveries, but none in the last fortnight for a deliberately short item', () => {
    const normal = simulate(200, 4).movements.filter((m) => m.type === 'RESTOCK');
    expect(normal.length).toBeGreaterThan(2);
    const short = simulate(4, 4, true).movements.filter((m) => m.type === 'RESTOCK');
    const quietFrom = now.getTime() - 12 * 24 * 60 * 60_000;
    expect(short.every((m) => m.at.getTime() < quietFrom)).toBe(true);
  });

  it('weaves write-offs into the chain', () => {
    const { sales } = simulate(100, 2);
    const movements = planStockMovements(
      [{ id: 'item', name: 'Paracetamol', finalOnHand: 100, lowStock: false }],
      sales,
      [{ itemId: 'item', quantity: 3, at: new Date('2026-11-05T09:00:00Z'), notes: 'Expired stock written off' }],
      now,
      windowDays,
    );
    const writeOff = movements.find((m) => m.type === 'ADJUSTMENT')!;
    expect(writeOff.quantity).toBe(-3);
    expect(writeOff.onHandBefore - writeOff.onHandAfter).toBe(3);
    for (let i = 1; i < movements.length; i++) expect(movements[i].onHandBefore).toBe(movements[i - 1].onHandAfter);
  });

  it('ignores sales older than the window and items that never moved', () => {
    const old: StockSale = { itemId: 'item', at: new Date('2026-08-01T10:00:00Z'), quantity: 2, orderId: 'old' };
    expect(planStockMovements([{ id: 'item', name: 'X', finalOnHand: 10, lowStock: false }], [old], [], now, windowDays)).toEqual([]);
  });
});
