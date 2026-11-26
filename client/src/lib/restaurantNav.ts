// Navigation for a restaurant org that also has invoicing, shared by Sidebar.tsx (desktop) and
// AppLayout.tsx (mobile "More" drawer and page titles). Stacking the invoicing menu on top of the
// POS one showed two "Dashboard"s, two "Payments", two "Reports" and two "AI Chat"s, with the till
// below the fold — so the restaurant comes first, invoicing sits in one block, and each look-alike
// gets a name that says which one it is. Restaurant-only or invoicing-only orgs don't use this.

export const RESTAURANT_GROUP_HREFS: { title: string; hrefs: string[] }[] = [
  {
    title: 'Restaurant',
    hrefs: ['/pos/dashboard', '/pos/order/new', '/pos/tables', '/pos/orders', '/pos/shift', '/pos/kitchen', '/pos/drinks'],
  },
  { title: 'Menu & Stock', hrefs: ['/pos/menu', '/pos/categories', '/inventory', '/pos/customers'] },
  { title: 'Money', hrefs: ['/pos/payments', '/pos/unreconciled-transfers', '/expenses', '/vendors', '/tax'] },
  { title: 'Invoicing', hrefs: ['/dashboard', '/clients', '/invoices', '/payments', '/settings/services'] },
  { title: 'Reports', hrefs: ['/pos/reports', '/reports', '/pos/leaderboard', '/pos/loyalty', '/pos/ai-chat', '/ai-chat'] },
  // The admin items (Users, Settings, Billing) are appended to this group
  { title: 'Setup', hrefs: ['/pos/order-types', '/pos/payment-types'] },
]

export const RESTAURANT_NAV_LABELS: Record<string, string> = {
  '/pos/dashboard': 'Dashboard',
  '/dashboard': 'Invoice Overview',
  '/pos/payments': 'Till Payments',
  '/payments': 'Invoice Payments',
  '/pos/reports': 'Sales Report',
  '/reports': 'Business Reports',
  '/pos/ai-chat': 'Sales AI Chat',
  '/ai-chat': 'Invoice AI Chat',
}
