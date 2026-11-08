import { PLAN_PRICES, TEST_ACCOUNT_PRICE, planAmount } from './plan-limits';

describe('planAmount', () => {
  it('returns the plan price for ordinary orgs', () => {
    expect(planAmount('PRO', 'MONTHLY')).toBe(PLAN_PRICES.PRO.monthly);
    expect(planAmount('PRO', 'ANNUAL')).toBe(PLAN_PRICES.PRO.annual);
    expect(planAmount('BUSINESS', 'ANNUAL', false)).toBe(PLAN_PRICES.BUSINESS.annual);
  });

  it('returns the token amount for test accounts, whatever the plan', () => {
    expect(TEST_ACCOUNT_PRICE).toBe(100);
    expect(planAmount('STARTER', 'MONTHLY', true)).toBe(100);
    expect(planAmount('BUSINESS', 'ANNUAL', true)).toBe(100);
  });
});
