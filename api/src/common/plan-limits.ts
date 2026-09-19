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
