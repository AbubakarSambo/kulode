import { describe, it, expect } from 'vitest'
import { customerSaveError } from './phoneErrors'

const apiError = (data: unknown) => ({ response: { data } })

describe('customerSaveError', () => {
  it('returns the server message for an invalid number', () => {
    expect(customerSaveError(apiError({ message: 'That number looks made up (repeated digits)', code: 'PHONE_INVALID' }), 'x')).toEqual({
      message: 'That number looks made up (repeated digits)',
      code: 'PHONE_INVALID',
      existingCustomerId: undefined,
    })
  })

  it('exposes the customer that already holds a number', () => {
    const res = customerSaveError(
      apiError({ message: 'Customer already exists', code: 'PHONE_EXISTS', errors: { existingCustomerId: 'c9', existingCustomerName: 'Ada' } }),
      'x',
    )
    expect(res).toMatchObject({ code: 'PHONE_EXISTS', existingCustomerId: 'c9' })
  })

  it('falls back when the error has no body (network failure)', () => {
    expect(customerSaveError(new Error('offline'), 'Failed to add customer').message).toBe('Failed to add customer')
  })
})
