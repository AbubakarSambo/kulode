import { describe, it, expect } from 'vitest'
import { getPostAuthRoute } from './authRouting'
import type { User } from '@/types'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    roles: [],
    organizationId: 'org1',
    organizationName: 'Test Org',
    ...overrides,
  }
}

describe('getPostAuthRoute', () => {
  it('sends a missing user to /login', () => {
    expect(getPostAuthRoute(null)).toBe('/login')
    expect(getPostAuthRoute(undefined)).toBe('/login')
  })

  describe('unrestricted roles (ADMIN, SUPER_ADMIN, ACCOUNTANT, STAFF, MANAGER)', () => {
    it('lands on /pos/order/new when the org is POS-only', () => {
      const user = makeUser({ roles: ['ADMIN'], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'POS' } })
      expect(getPostAuthRoute(user)).toBe('/pos/order/new')
    })

    it('lands on /dashboard when the org is INVOICING-only', () => {
      const user = makeUser({ roles: ['ADMIN'], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'INVOICING' } })
      expect(getPostAuthRoute(user)).toBe('/dashboard')
    })

    it('lands on /dashboard when the org has BOTH modules enabled', () => {
      const user = makeUser({ roles: ['ADMIN'], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'BOTH' } })
      expect(getPostAuthRoute(user)).toBe('/dashboard')
    })

    it('lands on /dashboard when the organization/enabledModules is missing entirely', () => {
      const user = makeUser({ roles: ['STAFF'] })
      expect(getPostAuthRoute(user)).toBe('/dashboard')
    })

    it('MANAGER (unrestricted) follows the module-based default, not the floor roles', () => {
      const user = makeUser({ roles: ['MANAGER'], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'POS' } })
      expect(getPostAuthRoute(user)).toBe('/pos/order/new')
    })
  })

  describe('single floor-restricted roles', () => {
    it('WAITER lands on the Sell screen', () => {
      const user = makeUser({ roles: ['WAITER'] })
      expect(getPostAuthRoute(user)).toBe('/pos/order/new')
    })

    it('CASHIER lands on Orders', () => {
      const user = makeUser({ roles: ['CASHIER'] })
      expect(getPostAuthRoute(user)).toBe('/pos/orders')
    })

    it('SUPERVISOR lands on Orders', () => {
      const user = makeUser({ roles: ['SUPERVISOR'] })
      expect(getPostAuthRoute(user)).toBe('/pos/orders')
    })

    it('PASS lands on the Kitchen board', () => {
      const user = makeUser({ roles: ['PASS'] })
      expect(getPostAuthRoute(user)).toBe('/pos/kitchen')
    })

    it('RUNNER lands on the Kitchen board', () => {
      const user = makeUser({ roles: ['RUNNER'] })
      expect(getPostAuthRoute(user)).toBe('/pos/kitchen')
    })
  })

  describe('multiple floor-restricted roles — precedence Waiter > Cashier/Supervisor > Pass/Runner', () => {
    it('WAITER + PASS lands on Sell (Waiter outranks Pass)', () => {
      const user = makeUser({ roles: ['WAITER', 'PASS'] })
      expect(getPostAuthRoute(user)).toBe('/pos/order/new')
    })

    it('CASHIER + PASS lands on Orders (Cashier outranks Pass)', () => {
      const user = makeUser({ roles: ['CASHIER', 'PASS'] })
      expect(getPostAuthRoute(user)).toBe('/pos/orders')
    })

    it('SUPERVISOR + RUNNER lands on Orders (Supervisor outranks Runner)', () => {
      const user = makeUser({ roles: ['SUPERVISOR', 'RUNNER'] })
      expect(getPostAuthRoute(user)).toBe('/pos/orders')
    })

    it('CASHIER + SUPERVISOR lands on Orders (either matches the same destination)', () => {
      const user = makeUser({ roles: ['CASHIER', 'SUPERVISOR'] })
      expect(getPostAuthRoute(user)).toBe('/pos/orders')
    })
  })

  describe('mixing a restricted role with an unrestricted one', () => {
    it('WAITER + MANAGER uses the unrestricted module-based route, not /pos/order/new via the waiter branch', () => {
      const user = makeUser({
        roles: ['WAITER', 'MANAGER'],
        organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'INVOICING' },
      })
      expect(getPostAuthRoute(user)).toBe('/dashboard')
    })

    it('PASS + ADMIN on a POS org lands on /pos/order/new via the module fallback', () => {
      const user = makeUser({
        roles: ['PASS', 'ADMIN'],
        organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'POS' },
      })
      expect(getPostAuthRoute(user)).toBe('/pos/order/new')
    })
  })

  describe('no roles at all', () => {
    it('falls back to the module-based default', () => {
      const posUser = makeUser({ roles: [], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'POS' } })
      expect(getPostAuthRoute(posUser)).toBe('/pos/order/new')

      const invoicingUser = makeUser({ roles: [] })
      expect(getPostAuthRoute(invoicingUser)).toBe('/dashboard')
    })

    it('treats a missing roles array the same as an empty one', () => {
      const user = makeUser({ roles: undefined as unknown as User['roles'] })
      expect(getPostAuthRoute(user)).toBe('/dashboard')
    })
  })
})
