import { describe, it, expect } from 'vitest'
import { computeOrderCharges } from './orderCharges'

describe('computeOrderCharges', () => {
  it('adds nothing when the org has no charges enabled (or settings have not loaded)', () => {
    expect(computeOrderCharges(2500, undefined).total).toBe(2500)
    expect(computeOrderCharges(2500, { vatEnabled: false, taxRate: 7.5 } as never).total).toBe(2500)
  })

  it('adds each enabled charge as a percentage of the subtotal, from string rates', () => {
    const charges = computeOrderCharges(10000, {
      vatEnabled: true,
      taxRate: '7.5',
      entertainmentTaxEnabled: true,
      entertainmentTaxRate: '5',
      serviceChargeEnabled: true,
      serviceChargeRate: '10',
    } as never)
    expect(charges).toEqual({ vatAmount: 750, entertainmentTaxAmount: 500, serviceChargeAmount: 1000, total: 12250 })
  })

  it('rounds each charge to kobo the way the API does', () => {
    // 333 * 7.5% = 24.975 -> 24.98
    expect(computeOrderCharges(333, { vatEnabled: true, taxRate: '7.5' } as never).vatAmount).toBe(24.98)
  })
})
