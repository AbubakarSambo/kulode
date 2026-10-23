import { buildPriceHistory } from './menu.service';

const sale = (unitPrice: number, quantity: number, iso: string) => ({ unitPrice, quantity, createdAt: new Date(iso) });

describe('buildPriceHistory', () => {
  it('returns nothing for an item that has never sold', () => {
    expect(buildPriceHistory([])).toEqual([]);
  });

  it('groups consecutive sales at the same price into one period', () => {
    const history = buildPriceHistory([
      sale(12500, 1, '2026-09-01T12:00:00Z'),
      sale(12500, 2, '2026-09-05T12:00:00Z'),
      sale(14000, 1, '2026-09-12T12:00:00Z'),
      sale(14000, 3, '2026-10-20T12:00:00Z'),
    ]);
    expect(history).toEqual([
      { price: 12500, firstSoldAt: new Date('2026-09-01T12:00:00Z'), lastSoldAt: new Date('2026-09-05T12:00:00Z'), quantitySold: 3 },
      { price: 14000, firstSoldAt: new Date('2026-09-12T12:00:00Z'), lastSoldAt: new Date('2026-10-20T12:00:00Z'), quantitySold: 4 },
    ]);
  });

  it('starts a new period when a price comes back after a change', () => {
    const history = buildPriceHistory([
      sale(5000, 1, '2026-08-01T12:00:00Z'),
      sale(6000, 1, '2026-08-10T12:00:00Z'),
      sale(5000, 1, '2026-08-20T12:00:00Z'),
    ]);
    expect(history.map((p) => p.price)).toEqual([5000, 6000, 5000]);
  });
});
