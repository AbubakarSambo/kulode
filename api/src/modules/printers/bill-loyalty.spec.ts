import { loyaltyLine } from './bill-escpos';

const fmt = (n: number) => `NGN ${n.toLocaleString('en-NG')}`;

describe('receipt loyalty line', () => {
  it('shows spend to the next reward and rewards available', () => {
    expect(loyaltyLine({ toNextReward: 32000, rewardsAvailable: 1 }, fmt)).toBe('Loyalty: NGN 32,000 to your next reward · 1 reward available');
  });
  it('pluralises, and omits the parts that do not apply', () => {
    expect(loyaltyLine({ toNextReward: null, rewardsAvailable: 2 }, fmt)).toBe('Loyalty: 2 rewards available');
    expect(loyaltyLine({ toNextReward: 10000, rewardsAvailable: 0 }, fmt)).toBe('Loyalty: NGN 10,000 to your next reward');
  });
  it('prints nothing for a non-member or when there is nothing to say', () => {
    expect(loyaltyLine(null, fmt)).toBeNull();
    expect(loyaltyLine(undefined, fmt)).toBeNull();
    expect(loyaltyLine({ toNextReward: null, rewardsAvailable: 0 }, fmt)).toBeNull();
  });
});
