import { bestRateFor, discountReasonWith, memberDiscountFor, stripMemberLabel } from './loyalty.discount';

const events = { ratePct: 7.5, menuItemIds: ['hall'], categoryIds: [] as string[] };
const screens = { ratePct: 10, menuItemIds: [] as string[], categoryIds: ['ads'] };
const line = (menuItemId: string | null, amount: number, categoryIds: string[] = [], isReward = false) => ({ menuItemId, amount, categoryIds, isReward });

describe('member discount', () => {
  it("applies the Living Room's rates: 7.5% on event space, 10% on screen advertising", () => {
    expect(memberDiscountFor([line('hall', 200000)], [events, screens])).toBe(15000);
    expect(memberDiscountFor([line('billboard', 50000, ['ads'])], [events, screens])).toBe(5000);
  });

  it('only discounts the lines that qualify', () => {
    expect(memberDiscountFor([line('hall', 100000), line('jollof', 5000), line('billboard', 20000, ['ads'])], [events, screens])).toBe(9500);
  });

  it('a line matched by two rules gets the better rate, not both', () => {
    const both = line('hall', 100000, ['ads']);
    expect(bestRateFor(both, [events, screens])).toBe(10);
    expect(memberDiscountFor([both], [events, screens])).toBe(10000);
  });

  it('never discounts a redeemed reward, a ₦0 line or a line with no menu item', () => {
    expect(memberDiscountFor([line('hall', 100000, [], true), line('hall', 0), line(null, 5000)], [events, screens])).toBe(0);
  });

  it('works in whole kobo (no drift across many lines)', () => {
    const lines = Array.from({ length: 1000 }, () => line('hall', 33.33));
    // 7.5% of 33.33 = 2.49975 → 2.50 per line when rounded to the kobo
    expect(memberDiscountFor(lines, [events])).toBe(2500);
  });

  it('strips the label back off when the member discount is removed', () => {
    expect(stripMemberLabel('Manager comp + Member discount')).toBe('Manager comp');
    expect(stripMemberLabel('Member discount')).toBeNull();
    expect(stripMemberLabel(null)).toBeNull();
    expect(stripMemberLabel('Birthday')).toBe('Birthday');
  });

  it('no rules, or no match, discounts nothing', () => {
    expect(memberDiscountFor([line('hall', 100000)], [])).toBe(0);
    expect(memberDiscountFor([line('jollof', 100000)], [events, screens])).toBe(0);
  });

  it('labels the discount, keeping a stacked manual discount\'s own reason', () => {
    expect(discountReasonWith(null, false)).toBe('Member discount');
    expect(discountReasonWith('Manager comp', true)).toBe('Manager comp + Member discount');
    expect(discountReasonWith('Manager comp + Member discount', true)).toBe('Manager comp + Member discount'); // re-applied
    expect(discountReasonWith('Member discount', true)).toBe('Discount + Member discount');
  });
});
