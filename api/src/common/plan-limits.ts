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

export const PLAN_PRICES = {
  STARTER: { monthly: 20000, annual: 200000 },
  PRO: { monthly: 35000, annual: 350000 },
  BUSINESS: { monthly: 50000, annual: 500000 },
} as const;

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
  billingPeriod: 'MONTHLY' | 'ANNUAL' | string | null | undefined,
  isTestAccount = false,
): number {
  if (isTestAccount) return TEST_ACCOUNT_PRICE;
  const prices = PLAN_PRICES[planTier];
  return billingPeriod === 'ANNUAL' ? prices.annual : prices.monthly;
}

// A live trial (TRIALING, not yet past trialEndDate — callers already drop an expired trial to an
// effective FREE plan) gets unlimited users, so a restaurant can load its whole floor staff while
// evaluating. Once it subscribes, the chosen plan's own maxUsers applies again.
export function maxUsersFor(effectivePlan: keyof typeof PLAN_LIMITS, subscriptionStatus: string): number {
  if (subscriptionStatus === 'TRIALING' && effectivePlan !== 'FREE') return Infinity;
  return PLAN_LIMITS[effectivePlan].maxUsers;
}
