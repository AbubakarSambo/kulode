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
    maxUsers: 10,
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

// A live trial (TRIALING, not yet past trialEndDate — callers already drop an expired trial to an
// effective FREE plan) gets unlimited users, so a restaurant can load its whole floor staff while
// evaluating. Once it subscribes, the chosen plan's own maxUsers applies again.
export function maxUsersFor(effectivePlan: keyof typeof PLAN_LIMITS, subscriptionStatus: string): number {
  if (subscriptionStatus === 'TRIALING' && effectivePlan !== 'FREE') return Infinity;
  return PLAN_LIMITS[effectivePlan].maxUsers;
}
