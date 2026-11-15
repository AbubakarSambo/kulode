import { describe, expect, it } from 'vitest'
import { isReceiptSettled } from './printBill'

const payment = { amount: 5000, paymentMethod: 'Cash', paymentDate: '2026-11-11T12:00:00.000Z' }

describe('isReceiptSettled', () => {
  it('is settled once a payment exists', () => {
    expect(isReceiptSettled({ payments: [payment], total: 5000, closedAt: null })).toBe(true)
  })

  it('is not settled for a bill nobody has paid yet', () => {
    expect(isReceiptSettled({ payments: [], total: 5000, closedAt: null })).toBe(false)
  })

  it('is settled for a closed order that came to nothing, which has no payment', () => {
    expect(isReceiptSettled({ payments: [], total: 0, closedAt: '2026-11-11T12:20:00.000Z' })).toBe(true)
  })

  it('is not settled for a zero-total order that is still open', () => {
    expect(isReceiptSettled({ payments: [], total: 0, closedAt: null })).toBe(false)
  })

  it('is not settled for a closed order that still owes money and has no payment', () => {
    expect(isReceiptSettled({ payments: [], total: 5000, closedAt: '2026-11-11T12:20:00.000Z' })).toBe(false)
  })
})
