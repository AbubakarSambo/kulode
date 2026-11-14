import {
  DEPARTMENTS,
  LOW_STOCK_NAMES,
  PRODUCTS,
  SPOILAGE_WRITE_OFFS,
  SUPERMARKET_ORG_SETTINGS,
  SUPERMARKET_PRICE_CHANGE,
  SUPERMARKET_STAFF,
} from './supermarket.constants';
import { createRng } from './demo-plan';
import {
  pickSupermarketPaymentKind,
  planSupermarketBasket,
  supermarketClosingTime,
  supermarketCumulativeShare,
  supermarketDayKey,
  supermarketOpeningTime,
  supermarketOrderCount,
  supermarketSaleTime,
  supermarketVat,
} from './supermarket-plan';

describe('supermarket catalogue', () => {
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

  it('sells every product above cost, at a thin supermarket margin', () => {
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(p.cost);
      expect(p.price / p.cost).toBeLessThan(1.6);
    }
  });

  it('is a proper supermarket range — a hundred-odd products across the departments', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(100);
    expect(DEPARTMENTS.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps a handful of items short on purpose, not most of the shelf', () => {
    expect(LOW_STOCK_NAMES.size).toBeGreaterThanOrEqual(5);
    expect(LOW_STOCK_NAMES.size).toBeLessThanOrEqual(10);
  });

  it('mixes VAT categories — exempt basic foods, standard-rated goods', () => {
    expect(new Set(PRODUCTS.map((p) => p.vatCategory))).toEqual(new Set(['EXEMPT', 'STANDARD']));
  });

  it('refers to real products in the price change and write-offs', () => {
    const names = new Set(PRODUCTS.map((p) => p.name));
    const price = new Map(PRODUCTS.map((p) => [p.name, p.price]));
    expect(names.has(SUPERMARKET_PRICE_CHANGE.itemName)).toBe(true);
    expect(price.get(SUPERMARKET_PRICE_CHANGE.itemName)).toBeGreaterThan(SUPERMARKET_PRICE_CHANGE.oldPrice);
    for (const [name] of SPOILAGE_WRITE_OFFS) expect(names.has(name)).toBe(true);
  });

  it('staffs several lanes — at least four cashiers, plus a manager and a supervisor', () => {
    const cashiers = SUPERMARKET_STAFF.filter((s) => s.roles.includes('CASHIER'));
    expect(cashiers.length).toBeGreaterThanOrEqual(4);
    expect(SUPERMARKET_STAFF.some((s) => s.roles.includes('MANAGER'))).toBe(true);
    expect(SUPERMARKET_STAFF.some((s) => s.roles.includes('SUPERVISOR'))).toBe(true);
  });
});

describe('supermarket clock', () => {
  it('opens at 08:00 and closes at 22:00 Lagos time (UTC+1) on the same date', () => {
    expect(supermarketOpeningTime('2026-11-10').toISOString()).toBe('2026-11-10T07:00:00.000Z');
    expect(supermarketClosingTime('2026-11-10').toISOString()).toBe('2026-11-10T21:00:00.000Z');
  });

  it('names the business day by the Lagos date', () => {
    expect(supermarketDayKey(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-10');
    expect(supermarketDayKey(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11');
  });

  it('puts every sale inside opening hours', () => {
    const rng = createRng(1);
    const key = '2026-11-10';
    for (let i = 0; i < 500; i++) {
      const at = supermarketSaleTime(rng, key);
      expect(at.getTime()).toBeGreaterThanOrEqual(supermarketOpeningTime(key).getTime());
      expect(at.getTime()).toBeLessThanOrEqual(supermarketClosingTime(key).getTime());
    }
  });

  it('reaches the full day by closing and nothing before opening', () => {
    const key = '2026-11-10';
    expect(supermarketCumulativeShare(key, new Date(supermarketOpeningTime(key).getTime() - 1))).toBe(0);
    expect(supermarketCumulativeShare(key, supermarketClosingTime(key))).toBeCloseTo(1, 5);
  });
});

describe('supermarket volume and baskets', () => {
  it('plans a deterministic number of sales a day, with a busy Saturday and a quieter midweek', () => {
    expect(supermarketOrderCount('2026-11-10', 0)).toBe(supermarketOrderCount('2026-11-10', 0));
    const tuesday = supermarketOrderCount('2026-11-10', 0);
    const saturday = supermarketOrderCount('2026-11-14', 0);
    expect(tuesday).toBeGreaterThan(60);
    expect(saturday).toBeGreaterThan(tuesday);
  });

  it('builds multi-line baskets of known products at shelf price', () => {
    const price = new Map(PRODUCTS.map((p) => [p.name, p.price]));
    const rng = createRng(7);
    let lines = 0;
    let totalValue = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const basket = planSupermarketBasket(rng);
      expect(basket.length).toBeGreaterThanOrEqual(1);
      expect(basket.length).toBeLessThanOrEqual(12);
      for (const line of basket) {
        expect(price.get(line.name)).toBe(line.price);
        expect(line.quantity).toBeGreaterThanOrEqual(1);
      }
      lines += basket.length;
      totalValue += basket.reduce((s, l) => s + l.price * l.quantity, 0);
    }
    // A supermarket basket: several lines, tens of thousands of naira — not a pharmacy's one or two.
    expect(lines / runs).toBeGreaterThan(3.5);
    expect(lines / runs).toBeLessThan(6);
    expect(totalValue / runs).toBeGreaterThan(12_000);
    expect(totalValue / runs).toBeLessThan(45_000);
  });

  it('sells across every department', () => {
    const rng = createRng(3);
    const departments = new Set<string>();
    const dept = new Map(DEPARTMENTS.flatMap((d) => d.items.map(([name]) => [name, d.name] as const)));
    for (let i = 0; i < 3000; i++) for (const l of planSupermarketBasket(rng)) departments.add(dept.get(l.name)!);
    expect(departments.size).toBe(DEPARTMENTS.length);
  });

  it('only offers the wallet when it is allowed', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) expect(pickSupermarketPaymentKind(rng, false)).not.toBe('WALLET');
    const kinds = new Set(Array.from({ length: 500 }, () => pickSupermarketPaymentKind(rng, true)));
    expect(kinds.has('WALLET')).toBe(true);
    expect(kinds.has('CASH')).toBe(true);
  });
});

describe('supermarket VAT', () => {
  it('is switched on org-wide at 7.5%', () => {
    expect(SUPERMARKET_ORG_SETTINGS.vatEnabled).toBe(true);
    expect(SUPERMARKET_ORG_SETTINGS.taxRate).toBe(7.5);
  });

  it('rounds to kobo exactly as the order service does (percentage of subtotal)', () => {
    expect(supermarketVat(10_000)).toBe(750);
    expect(supermarketVat(2_500)).toBe(187.5);
    // 7.5% of 1,234.30 = 92.5725 -> 92.57
    expect(supermarketVat(1_234.3)).toBe(92.57);
    expect(supermarketVat(0)).toBe(0);
  });
});
