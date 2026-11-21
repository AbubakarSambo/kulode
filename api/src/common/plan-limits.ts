export const PLAN_LIMITS = {
  FREE: {
    maxUsers: 1,
    maxInvoicesPerMonth: 5,
    restrictedPages: ['dashboard', 'vendors', 'expenses', 'reports', 'expense-categories', 'tax', 'inventory', 'clients', 'invoices', 'payments'],
  },
  STARTER: {
    maxUsers: 1,
    maxInvoicesPerMonth: 30,
    restrictedPages: ['vendors', 'expenses', 'reports', 'inventory', 'expense-categories', 'tax'],
  },
  PRO: {
    maxUsers: 20,
    maxInvoicesPerMonth: 100,
    restrictedPages: [],
  },
  BUSINESS: {
    maxUsers: Infinity,
    maxInvoicesPerMonth: Infinity,
    restrictedPages: [],
  },
} as const;

/**
 * Pro is the only plan sold. Starter and Business are legacy: organizations already on them keep
 * their plan and are renewed at these prices, but they can no longer be bought.
 */
export const SELLABLE_PLAN = 'PRO' as const;

/** How many calendar months each billing period covers. */
export const BILLING_PERIOD_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUAL: 6,
  ANNUAL: 12,
} as const;

export type BillingPeriodKey = keyof typeof BILLING_PERIOD_MONTHS;

export const BILLING_PERIODS = Object.keys(BILLING_PERIOD_MONTHS) as BillingPeriodKey[];

/**
 * Pro: 3 months is 5% off, 6 months 10% off, 12 months is two months free. The 3- and 6-month
 * prices are rounded to the nearest 500 naira. Legacy tiers only ever had monthly and annual.
 */
export const PLAN_PRICES = {
  STARTER: { monthly: 29000, annual: 290000 },
  PRO: { monthly: 49000, quarterly: 139500, biannual: 264500, annual: 490000 },
  BUSINESS: { monthly: 59000, annual: 590000 },
} as const;

/** The billing period a payment of this many months is recorded as, or null if it matches none. */
export function billingPeriodForMonths(months: number): BillingPeriodKey | null {
  return BILLING_PERIODS.find((period) => BILLING_PERIOD_MONTHS[period] === months) ?? null;
}

/** Months a billing period covers; anything unrecognised is treated as one month. */
export function monthsInBillingPeriod(billingPeriod: string | null | undefined): number {
  return BILLING_PERIOD_MONTHS[billingPeriod as BillingPeriodKey] ?? 1;
}

/**
 * Organizations a platform admin has flagged as test accounts pay this token amount (naira)
 * instead of the plan price, so real payments — cards, bank debits, webhooks, renewals — can be
 * tried end to end with real money for almost nothing. Real customers are never affected.
 * Paystack recommends at least 50 naira for a first charge.
 */
export const TEST_ACCOUNT_PRICE = 100;

/** What an organization is charged for a plan: the plan price, or the token amount for a test account. */
export function planAmount(
  planTier: keyof typeof PLAN_PRICES,
  billingPeriod: BillingPeriodKey | string | null | undefined,
  isTestAccount = false,
): number {
  if (isTestAccount) return TEST_ACCOUNT_PRICE;
  const prices: Partial<Record<'monthly' | 'quarterly' | 'biannual' | 'annual', number>> = PLAN_PRICES[planTier];
  const byPeriod: Record<BillingPeriodKey, number | undefined> = {
    MONTHLY: prices.monthly,
    QUARTERLY: prices.quarterly,
    BIANNUAL: prices.biannual,
    ANNUAL: prices.annual,
  };
  const price = byPeriod[billingPeriod as BillingPeriodKey];
  // A legacy tier has no quarterly/biannual price; never silently undercharge or throw mid-renewal.
  return price ?? (prices.monthly as number) * monthsInBillingPeriod(billingPeriod);
}

// A live trial (TRIALING, not yet past trialEndDate — callers already drop an expired trial to an
// effective FREE plan) gets unlimited users, so a restaurant can load its whole floor staff while
// evaluating. Once it subscribes, the chosen plan's own maxUsers applies again.
export function maxUsersFor(effectivePlan: keyof typeof PLAN_LIMITS, subscriptionStatus: string): number {
  if (subscriptionStatus === 'TRIALING' && effectivePlan !== 'FREE') return Infinity;
  return PLAN_LIMITS[effectivePlan].maxUsers;
}
