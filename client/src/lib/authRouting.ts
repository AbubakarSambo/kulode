import type { User } from '@/types'

/**
 * Single source of truth for "where does this user land" — used right after login and
 * whenever a route bounces someone away (denied role, already-authenticated guest route).
 * Role-restricted roles (kitchen, waiter) must be checked before the org-module fallback,
 * since neither of them has dashboard/invoicing access regardless of the org's modules.
 */
export function getPostAuthRoute(user: User | null | undefined): string {
  if (!user) return '/login'
  if (user.role === 'PASS' || user.role === 'RUNNER') return '/pos/kitchen'
  if (user.role === 'WAITER') return '/pos/order/new'
  return user.organization?.enabledModules === 'POS' ? '/pos/order/new' : '/dashboard'
}
