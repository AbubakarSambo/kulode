import { PLAN_PRICES, TEST_ACCOUNT_PRICE, maxUsersFor, planAmount } from './plan-limits';

describe('maxUsersFor', () => {
  it('is unlimited during a live PRO trial', () => {
    expect(maxUsersFor('PRO', 'TRIALING')).toBe(Infinity);
  });

  it("uses the plan's own cap once subscribed", () => {
    expect(maxUsersFor('PRO', 'ACTIVE')).toBe(20);
    expect(maxUsersFor('STARTER', 'ACTIVE')).toBe(1);
  });

  it('falls back to the FREE cap once a trial has expired', () => {
    // Callers pass an effective plan of FREE for a TRIALING org past its trialEndDate.
    expect(maxUsersFor('FREE', 'TRIALING')).toBe(1);
  });
});

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
