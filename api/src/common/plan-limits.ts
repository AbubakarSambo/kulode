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
  STARTER: { monthly: 29500, annual: 295000 },
  PRO: { monthly: 49500, annual: 495000 },
  BUSINESS: { monthly: 69500, annual: 695000 },
} as const;
