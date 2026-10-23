import { MENU, PAYMENT_MIX } from './demo.constants';
import {
  addDays,
  businessDayKey,
  closingTime,
  computeCharges,
  createRng,
  cumulativeShare,
  openingTime,
  pickPaymentKind,
  planBasket,
  plannedOrderCount,
  sampleOrderTime,
} from './demo-plan';

const menuPrices = new Map(MENU.flatMap((c) => c.items).map((i) => [i.name, i.price]));

describe('demo-plan', () => {
  describe('business day clock', () => {
    it('opens at 08:00 and closes at 02:00 Lagos time (UTC+1)', () => {
      expect(openingTime('2026-10-23').toISOString()).toBe('2026-10-23T07:00:00.000Z');
      expect(closingTime('2026-10-23').toISOString()).toBe('2026-10-24T01:00:00.000Z');
    });

    it('counts the hours after midnight as the previous business day', () => {
      // 01:30 Lagos on the 24th is still the 23rd's service.
      expect(businessDayKey(new Date('2026-10-24T00:30:00Z'))).toBe('2026-10-23');
      // 03:00 Lagos on the 24th belongs to the 24th (before opening).
      expect(businessDayKey(new Date('2026-10-24T02:00:00Z'))).toBe('2026-10-24');
      expect(businessDayKey(new Date('2026-10-24T12:00:00Z'))).toBe('2026-10-24');
    });

    it('adds days across month ends', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe('volume', () => {
    it('is deterministic for a given day', () => {
      expect(plannedOrderCount('2026-10-23', 0)).toBe(plannedOrderCount('2026-10-23', 0));
    });

    it('stays in the live restaurant’s range of roughly 90–160 orders a day', () => {
      for (let i = 0; i < 90; i++) {
        const count = plannedOrderCount(addDays('2026-10-23', -i), i);
        expect(count).toBeGreaterThanOrEqual(80);
        expect(count).toBeLessThanOrEqual(160);
      }
    });

    it('builds up through the day along the hourly curve', () => {
      const key = '2026-10-23';
      expect(cumulativeShare(key, new Date('2026-10-23T06:00:00Z'))).toBe(0);
      const lunch = cumulativeShare(key, new Date('2026-10-23T12:00:00Z'));
      const evening = cumulativeShare(key, new Date('2026-10-23T19:00:00Z'));
      expect(lunch).toBeGreaterThan(0.2);
      expect(lunch).toBeLessThan(evening);
      expect(evening).toBeLessThan(1);
      expect(cumulativeShare(key, new Date('2026-10-24T01:30:00Z'))).toBe(1);
    });

    it('only samples order times inside opening hours', () => {
      const rng = createRng(1);
      for (let i = 0; i < 500; i++) {
        const at = sampleOrderTime(rng, '2026-10-23');
        expect(at.getTime()).toBeGreaterThanOrEqual(openingTime('2026-10-23').getTime());
        expect(at.getTime()).toBeLessThanOrEqual(closingTime('2026-10-23').getTime());
      }
    });
  });

  describe('baskets', () => {
    it('uses real menu prices and averages about five lines for dine-in', () => {
      const rng = createRng(42);
      let lines = 0;
      for (let i = 0; i < 400; i++) {
        const basket = planBasket(rng, 'Dine In');
        expect(basket.length).toBeGreaterThan(0);
        for (const line of basket) {
          expect(line.price).toBe(menuPrices.get(line.name));
          expect(line.quantity).toBeGreaterThan(0);
        }
        lines += basket.length;
      }
      expect(lines / 400).toBeGreaterThan(3.5);
      expect(lines / 400).toBeLessThan(6);
    });

    it('adds packaging to takeaway and delivery orders only', () => {
      const rng = createRng(7);
      for (let i = 0; i < 100; i++) {
        expect(planBasket(rng, 'Takeaway').some((l) => l.name === 'Takeaway Pack')).toBe(true);
        expect(planBasket(rng, 'Dine In').some((l) => l.name === 'Takeaway Pack')).toBe(false);
      }
    });

    it('lands median order values near the live restaurant’s ₦40k', () => {
      const rng = createRng(99);
      const totals = Array.from({ length: 1000 }, () => {
        const subtotal = planBasket(rng, 'Dine In').reduce((sum, l) => sum + l.price * l.quantity, 0);
        return computeCharges(subtotal).total;
      }).sort((a, b) => a - b);
      const median = totals[500];
      expect(median).toBeGreaterThan(25_000);
      expect(median).toBeLessThan(70_000);
    });
  });

  describe('charges', () => {
    it('applies VAT 7.5%, entertainment tax 5% and service charge 5%', () => {
      expect(computeCharges(10_000)).toEqual({
        subtotal: 10_000,
        vatAmount: 750,
        entertainmentTaxAmount: 500,
        serviceChargeAmount: 500,
        taxAmount: 1250,
        total: 11_750,
      });
    });
  });

  describe('payments', () => {
    it('never picks WALLET when the customer has no wallet room', () => {
      const rng = createRng(3);
      for (let i = 0; i < 500; i++) expect(pickPaymentKind(rng, false)).not.toBe('WALLET');
    });

    it('has wallet customers mostly pay from their wallet, and everyone else mostly by Moniepoint', () => {
      const rng = createRng(5);
      const counts = new Map<string, number>();
      for (let i = 0; i < 5000; i++) {
        const kind = pickPaymentKind(rng, true);
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
      const auto = (counts.get('AUTO_TRANSFER') ?? 0) + (counts.get('AUTO_POS') ?? 0);
      const total = PAYMENT_MIX.reduce((s, p) => s + p.weight, 0);
      const autoWeight = PAYMENT_MIX.filter((p) => p.kind.startsWith('AUTO')).reduce((s, p) => s + p.weight, 0);
      expect(auto / 5000).toBeCloseTo((0.55 * autoWeight) / total, 1);
      expect(Math.max(...counts.values())).toBe(counts.get('WALLET'));
    });
  });
});
