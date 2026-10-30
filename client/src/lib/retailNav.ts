// Retail-mode navigation rules, shared by Sidebar.tsx (desktop) and AppLayout.tsx (mobile dock,
// "More" drawer and page titles) so the two can't drift apart — the same reason posRoleNav.ts exists.

// Pages with no place in a retail (scan-and-sell) org — tables, kitchen tickets and the menu are
// dine-in concepts.
export const RETAIL_HIDDEN_HREFS = [
  '/pos/tables',
  '/pos/kitchen',
  '/pos/drinks',
  '/pos/menu',
  '/pos/categories',
  '/pos/order-types',
]

// A retail org that also has invoicing would otherwise see two "Dashboard"s, two "Payments", two
// "Reports" and two "AI Chat"s side by side — each pair gets a name that says which one it is.
// The POS dashboard keeps the plain "Dashboard": it's where a retail admin lands. POS Customers
// become "Wallets": in a shop a customer record exists only to hold a prepaid/credit wallet, and
// the name keeps it from reading as a duplicate of invoicing's Clients.
export const RETAIL_NAV_LABELS: Record<string, string> = {
  '/pos/customers': 'Wallets',
  '/pos/dashboard': 'Dashboard',
  '/dashboard': 'Overview',
  '/pos/orders': 'Sales',
  '/inventory': 'Catalog',
  '/pos/payments': 'Till Payments',
  '/payments': 'Invoice Payments',
  '/pos/reports': 'Sales Report',
  '/reports': 'Business Reports',
  '/pos/ai-chat': 'Sales AI Chat',
  '/ai-chat': 'Invoice AI Chat',
}

export function isRetailHidden(href: string): boolean {
  return RETAIL_HIDDEN_HREFS.includes(href)
}

/** The retail name for a nav href, or `fallback` when it keeps its usual name. */
export function retailNavLabel(href: string, fallback: string): string {
  return RETAIL_NAV_LABELS[href] ?? fallback
}

/** The retail page title for a path (longest matching href wins, so /pos/payments beats /payments). */
export function retailPageTitle(path: string): string | undefined {
  const match = Object.keys(RETAIL_NAV_LABELS)
    .filter((href) => path === href || path.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]
  return match && RETAIL_NAV_LABELS[match]
}
