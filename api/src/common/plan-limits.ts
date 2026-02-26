export const PLAN_LIMITS = {
  FREE: {
    maxUsers: 1,
    maxInvoicesPerMonth: 50,
    restrictedPages: ['dashboard', 'vendors', 'expenses', 'reports', 'expense-categories'],
  },
  PRO: {
    maxUsers: 3,
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
  PRO: { monthly: 9900, annual: 99000 },
  BUSINESS: { monthly: 40000, annual: 400000 },
} as const;
