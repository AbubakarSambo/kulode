import {
  BILLING_PERIOD_MONTHS,
  PLAN_PRICES,
  TEST_ACCOUNT_PRICE,
  billingPeriodForMonths,
  maxUsersFor,
  monthsInBillingPeriod,
  planAmount,
} from './plan-limits';

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

describe('Pro billing terms', () => {
  it('prices each term from the monthly price: 5% off 3 months, 10% off 6, two months free for 12', () => {
    const monthly = PLAN_PRICES.PRO.monthly;
    expect(planAmount('PRO', 'MONTHLY')).toBe(49000);
    expect(planAmount('PRO', 'QUARTERLY')).toBe(139500);
    expect(planAmount('PRO', 'BIANNUAL')).toBe(264500);
    expect(planAmount('PRO', 'ANNUAL')).toBe(monthly * 10);
  });

  it('gets cheaper per month the longer the term', () => {
    const perMonth = (p: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL') =>
      planAmount('PRO', p) / BILLING_PERIOD_MONTHS[p];
    expect(perMonth('QUARTERLY')).toBeLessThan(perMonth('MONTHLY'));
    expect(perMonth('BIANNUAL')).toBeLessThan(perMonth('QUARTERLY'));
    expect(perMonth('ANNUAL')).toBeLessThan(perMonth('BIANNUAL'));
  });

  it('charges test accounts the token amount for every term', () => {
    expect(planAmount('PRO', 'QUARTERLY', true)).toBe(100);
    expect(planAmount('PRO', 'BIANNUAL', true)).toBe(100);
  });

  it('keeps legacy tiers on their own monthly and annual prices', () => {
    expect(planAmount('STARTER', 'MONTHLY')).toBe(29000);
    expect(planAmount('BUSINESS', 'ANNUAL')).toBe(590000);
  });

  it('falls back to monthly x months if a legacy tier somehow has a 3 or 6 month period', () => {
    expect(planAmount('BUSINESS', 'QUARTERLY')).toBe(59000 * 3);
  });

  it('maps periods to months and back', () => {
    expect(monthsInBillingPeriod('QUARTERLY')).toBe(3);
    expect(monthsInBillingPeriod('BIANNUAL')).toBe(6);
    expect(monthsInBillingPeriod('ANNUAL')).toBe(12);
    expect(monthsInBillingPeriod('SOMETHING_ELSE')).toBe(1);
    expect(billingPeriodForMonths(3)).toBe('QUARTERLY');
    expect(billingPeriodForMonths(6)).toBe('BIANNUAL');
    expect(billingPeriodForMonths(12)).toBe('ANNUAL');
    expect(billingPeriodForMonths(5)).toBeNull();
  });
});
