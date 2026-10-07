import type { UserRole } from '@/types'

// Single source of truth for which POS routes a restricted role can reach — shared by Sidebar.tsx
// (desktop nav) and AppLayout.tsx (mobile bottom dock) so the two can't drift apart. They used to
// each keep their own copy of these arrays "in lockstep" by convention; that convention broke
// twice over — AppLayout's icon lookup was missing '/pos/payments'/'/pos/unreconciled-transfers'
// entries that its own CASHIER/SUPERVISOR lists required (crashed any cashier/supervisor landing
// on a POS page), and separately AppLayout's CASHIER_ALLOWED_HREFS had silently fallen out of
// sync with Sidebar's broader one (missing '/pos/order/new', '/pos/menu', '/pos/categories').
// Consuming this module instead of a local copy makes both impossible: there is only one array to
// edit, and AppLayout's icon map is typed to require an entry for every href used here (see
// `AllowedHref` below), so a missing icon is a compile error rather than a runtime crash.

// Waiters handle selling, order tracking, customer lookup, and the table list
export const WAITER_ALLOWED_HREFS = ['/pos/order/new', '/pos/orders', '/pos/customers', '/pos/tables', '/pos/reports'] as const

// Pass/Runner/Kitchen are kitchen-only roles — the ticket board is the only page they can see
export const KITCHEN_ALLOWED_HREFS = ['/pos/kitchen', '/pos/drinks', '/pos/reports'] as const

// Cashiers can also sell, close out orders and take payment, manage the table list, and view/add
// menu items and categories (not edit/delete — that stays admin-only) — no waiter management or
// analytics beyond reports
export const CASHIER_ALLOWED_HREFS = [
  '/pos/order/new',
  '/pos/orders',
  '/pos/customers',
  '/pos/shift',
  '/pos/tables',
  '/pos/reports',
  '/pos/menu',
  '/pos/categories',
  '/pos/unreconciled-transfers',
  '/pos/payments',
] as const

// Supervisors get floor oversight (orders, customers, shift, kitchen) but not menu/category
// editing or user management (staff roster lives entirely on the admin-only Users page).
export const SUPERVISOR_ALLOWED_HREFS = ['/pos/orders', '/pos/customers', '/pos/shift', '/pos/kitchen', '/pos/drinks', '/pos/reports', '/pos/unreconciled-transfers'] as const

// Every href any of the arrays above can produce — AppLayout's icon lookup is typed as
// `Record<AllowedHref, ...>`, so adding a new href to any array above without also adding an icon
// for it there is a compile error, not a silent `undefined` icon at runtime.
export type AllowedHref =
  | (typeof WAITER_ALLOWED_HREFS)[number]
  | (typeof KITCHEN_ALLOWED_HREFS)[number]
  | (typeof CASHIER_ALLOWED_HREFS)[number]
  | (typeof SUPERVISOR_ALLOWED_HREFS)[number]

// Roles that get a tight nav allowlist rather than the broader access every other role has.
// A user with multiple roles sees the UNION of what each individually unlocks — e.g. a
// Waiter+Pass user sees Sell/Orders/Customers AND the kitchen board. But if ANY assigned role
// is unrestricted (not in this map), that's already a superset of these allowlists, so the
// tight filtering is skipped entirely in favor of the normal broader rules.
export const RESTRICTED_ROLE_HREFS: Partial<Record<UserRole, readonly AllowedHref[]>> = {
  WAITER: WAITER_ALLOWED_HREFS,
  PASS: KITCHEN_ALLOWED_HREFS,
  RUNNER: KITCHEN_ALLOWED_HREFS,
  KITCHEN: KITCHEN_ALLOWED_HREFS,
  CASHIER: CASHIER_ALLOWED_HREFS,
  SUPERVISOR: SUPERVISOR_ALLOWED_HREFS,
}

/** Null means "unrestricted" — at least one of the user's roles isn't in RESTRICTED_ROLE_HREFS. */
export function getRestrictedHrefsUnion(userRoles: UserRole[]): AllowedHref[] | null {
  const hasUnrestrictedRole = userRoles.some((r) => !(r in RESTRICTED_ROLE_HREFS))
  if (hasUnrestrictedRole) return null
  return Array.from(new Set(userRoles.flatMap((r) => RESTRICTED_ROLE_HREFS[r] ?? [])))
}
