// Mirrors api/src/common/tip-rules.ts — the server enforces these, the till uses them to ask first.

export const TIP_CONFIRM_ABOVE = 20_000
export const TIP_CONFIRM_RATIO = 0.5

export function tipNeedsConfirmation(tipAmount: number, billTotal: number): boolean {
  if (tipAmount > TIP_CONFIRM_ABOVE) return true
  return billTotal > 0 && tipAmount > billTotal * TIP_CONFIRM_RATIO
}

// Same name-based reading of a payment method as api/src/common/payment-method-kind.ts: tips are
// card or transfer only, so cash, wallet and "other" tenders never offer one.
export function isTipEligibleMethod(paymentMethod: string): boolean {
  const method = paymentMethod.toUpperCase().replace(/[\s-]+/g, '_')
  if (method === 'WALLET' || method === 'CASH') return false
  return method.includes('TRANSFER') || method.includes('CARD') || method.includes('POS')
}
