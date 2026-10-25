import { describe, it, expect } from 'vitest'
import * as client from './permissions'
// The API's copy is the source of truth — this import is what makes drift a test failure.
import * as api from '../../../api/src/common/permissions'

describe('permission matrix mirrors the API', () => {
  it('has identical permissions', () => {
    expect(client.PERMISSIONS).toEqual(api.PERMISSIONS)
  })

  it('has identical PIN and staff-management role sets', () => {
    expect(client.PIN_LOGIN_ROLES).toEqual(api.PIN_LOGIN_ROLES)
    expect(client.APPROVAL_PIN_ROLES).toEqual(api.APPROVAL_PIN_ROLES)
    expect(client.FLOOR_STAFF_ROLES).toEqual(api.FLOOR_STAFF_ROLES)
  })

  it('can() checks the union of a user’s roles', () => {
    expect(client.can({ roles: ['CASHIER'] }, 'PAYMENT_TAKE')).toBe(true)
    expect(client.can({ roles: ['WAITER'] }, 'PAYMENT_TAKE')).toBe(false)
    expect(client.can(null, 'ORDER_SELL')).toBe(false)
  })

  it('allows approval-only PINs for approvers but not invoicing STAFF', () => {
    expect(client.canHoldPin(['SUPERVISOR'])).toBe(true)
    expect(client.canHoldPin(['MANAGER'])).toBe(true)
    expect(client.canHoldPin(['WAITER', 'CASHIER'])).toBe(true)
    expect(client.canHoldPin(['STAFF'])).toBe(false)
  })
})
