import type { Organization } from '@/types'

// Mirrors OrdersService.computeOrderCharges on the API: each charge applies only if the org has it
// enabled (and the caller hasn't turned it off for this order), is a percentage of the subtotal,
// and is rounded to kobo the same way — so a total previewed here matches what the order will be.
export interface OrderCharges {
  vatAmount: number
  entertainmentTaxAmount: number
  serviceChargeAmount: number
  total: number
}

type ChargeSettings = Pick<
  Organization,
  'vatEnabled' | 'taxRate' | 'entertainmentTaxEnabled' | 'entertainmentTaxRate' | 'serviceChargeEnabled' | 'serviceChargeRate'
>

const percentOf = (subtotal: number, rate: number) => Math.round(subtotal * (rate / 100) * 100) / 100

export function computeOrderCharges(subtotal: number, org: ChargeSettings | undefined): OrderCharges {
  // Rates arrive as numeric strings (Prisma Decimal over JSON) — coerce before doing maths on them
  const vatAmount = org?.vatEnabled ? percentOf(subtotal, Number(org.taxRate)) : 0
  const entertainmentTaxAmount = org?.entertainmentTaxEnabled ? percentOf(subtotal, Number(org.entertainmentTaxRate)) : 0
  const serviceChargeAmount = org?.serviceChargeEnabled ? percentOf(subtotal, Number(org.serviceChargeRate)) : 0
  return {
    vatAmount,
    entertainmentTaxAmount,
    serviceChargeAmount,
    total: subtotal + vatAmount + entertainmentTaxAmount + serviceChargeAmount,
  }
}
