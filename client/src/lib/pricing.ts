import type { BillingPeriod } from '@/types'

/**
 * Pro is the only plan on sale. These prices must match PLAN_PRICES.PRO in
 * api/src/common/plan-limits.ts, which is what is actually charged.
 */
export const PRO_MONTHLY_PRICE = 49000

export interface BillingTerm {
  period: BillingPeriod
  months: number
  /** Short label for the selector. */
  label: string
  /** Wording for "Billed ... every ..." and receipts. */
  cycleLabel: string
  price: number
  /** Selector badge, e.g. "Save 5%". */
  badge: string | null
}

export const BILLING_TERMS: BillingTerm[] = [
  { period: 'MONTHLY', months: 1, label: '1 month', cycleLabel: 'month', price: 49000, badge: null },
  { period: 'QUARTERLY', months: 3, label: '3 months', cycleLabel: '3 months', price: 139500, badge: 'Save 5%' },
  { period: 'BIANNUAL', months: 6, label: '6 months', cycleLabel: '6 months', price: 264500, badge: 'Save 10%' },
  { period: 'ANNUAL', months: 12, label: '12 months', cycleLabel: '12 months', price: 490000, badge: '2 months free' },
]

export function billingTerm(period: BillingPeriod | string | null | undefined): BillingTerm {
  return BILLING_TERMS.find((t) => t.period === period) ?? BILLING_TERMS[0]
}

/** What the term would cost at the monthly price, before any discount. */
export function listPrice(term: BillingTerm): number {
  return PRO_MONTHLY_PRICE * term.months
}

export function perMonthPrice(term: BillingTerm): number {
  return Math.round(term.price / term.months)
}

/** The date a payment made now would cover until (same arithmetic the API uses to activate it). */
export function coveredUntil(term: BillingTerm, from: Date = new Date()): Date {
  const end = new Date(from)
  if (term.period === 'ANNUAL') end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + term.months)
  return end
}

/** A past receipt or the current plan line: "Billed Monthly", "Billed every 3 months" and so on. */
export function billedLabel(period: BillingPeriod | string | null | undefined): string {
  const term = billingTerm(period)
  return term.period === 'MONTHLY' ? 'Billed Monthly' : `Billed every ${term.months} months`
}
