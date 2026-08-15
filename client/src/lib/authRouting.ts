import type { User } from '@/types'

/**
 * Single source of truth for "where does this user land" — used right after login and
 * whenever a route bounces someone away (denied role, already-authenticated guest route).
 * Role-restricted roles (kitchen, waiter, cashier, supervisor) must be checked before the
 * org-module fallback, since none of them has dashboard/invoicing access regardless of the
 * org's modules.
 *
 * A user can hold multiple roles at once — precedence goes broadest-first: any role outside
 * {WAITER, PASS, RUNNER, CASHIER, SUPERVISOR} means this account isn't floor-restricted at all,
 * so it uses the normal module-based default. Among the restricted roles, Waiter (Sell) outranks
 * Cashier/Supervisor (Orders) outranks Pass/Runner (Kitchen) — each landing page must match a
 * page that role's own Sidebar allowlist actually shows, so the destination is never
 * dead-ended behind a hidden nav.
 */
export function getPostAuthRoute(user: User | null | undefined): string {
  if (!user) return '/login'
  const roles = user.roles ?? []
  const hasUnrestrictedRole = roles.some(
    (r) => r !== 'PASS' && r !== 'RUNNER' && r !== 'WAITER' && r !== 'CASHIER' && r !== 'SUPERVISOR',
  )
  if (hasUnrestrictedRole) {
    return user.organization?.enabledModules === 'POS' ? '/pos/order/new' : '/dashboard'
  }
  if (roles.includes('WAITER')) return '/pos/order/new'
  if (roles.includes('CASHIER') || roles.includes('SUPERVISOR')) return '/pos/orders'
  if (roles.includes('PASS') || roles.includes('RUNNER')) return '/pos/kitchen'
  return user.organization?.enabledModules === 'POS' ? '/pos/order/new' : '/dashboard'
}
