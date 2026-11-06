// Which broad kind of money a payment method is, by name. Method names are free-form per org
// (PaymentType names like "Card (MP)" or "Bank Transfer", plus reserved literals such as
// MONIEPOINT_POS / MONIEPOINT_TRANSFER / WALLET), so match on a normalised name; anything
// unrecognised is 'other' rather than being silently mislabelled. Complimentary types aren't
// decided here — that's a flag on the PaymentType (isComplimentary).

export type PaymentMethodKind = 'cash' | 'card' | 'transfer' | 'wallet' | 'other';

export function classifyPaymentMethod(paymentMethod: string): PaymentMethodKind {
  const method = paymentMethod.toUpperCase().replace(/[\s-]+/g, '_');
  if (method === 'WALLET') return 'wallet';
  if (method === 'CASH') return 'cash';
  if (method.includes('TRANSFER')) return 'transfer';
  if (method.includes('CARD') || method.includes('POS') || method === 'PAYSTACK') return 'card';
  return 'other';
}
