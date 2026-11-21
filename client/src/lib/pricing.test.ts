import { describe, expect, it } from 'vitest'
import { BILLING_TERMS, billedLabel, billingTerm, coveredUntil, listPrice, perMonthPrice } from './pricing'

describe('billing terms', () => {
  it('lists the four terms shortest first', () => {
    expect(BILLING_TERMS.map((t) => t.period)).toEqual(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'])
  })

  it('gets cheaper per month the longer the term', () => {
    const perMonth = BILLING_TERMS.map(perMonthPrice)
    expect([...perMonth].sort((a, b) => b - a)).toEqual(perMonth)
    expect(new Set(perMonth).size).toBe(perMonth.length)
  })

  it('shows the right saving against the monthly price', () => {
    const get = (p: string) => billingTerm(p)
    expect(1 - get('QUARTERLY').price / listPrice(get('QUARTERLY'))).toBeCloseTo(0.05, 2)
    expect(1 - get('BIANNUAL').price / listPrice(get('BIANNUAL'))).toBeCloseTo(0.1, 2)
    expect(get('ANNUAL').price).toBe(listPrice(get('ANNUAL')) - 2 * 49000)
  })

  it('falls back to monthly for an unknown period', () => {
    expect(billingTerm('WEEKLY').period).toBe('MONTHLY')
    expect(billingTerm(null).period).toBe('MONTHLY')
  })

  it('computes the covered-until date like the server does', () => {
    const from = new Date('2026-11-15T10:00:00Z')
    expect(coveredUntil(billingTerm('QUARTERLY'), from).toISOString()).toBe('2027-02-15T10:00:00.000Z')
    expect(coveredUntil(billingTerm('BIANNUAL'), from).toISOString()).toBe('2027-05-15T10:00:00.000Z')
    expect(coveredUntil(billingTerm('ANNUAL'), from).toISOString()).toBe('2027-11-15T10:00:00.000Z')
  })

  it('words the billed label', () => {
    expect(billedLabel('MONTHLY')).toBe('Billed Monthly')
    expect(billedLabel('BIANNUAL')).toBe('Billed every 6 months')
    expect(billedLabel('ANNUAL')).toBe('Billed every 12 months')
  })
})
