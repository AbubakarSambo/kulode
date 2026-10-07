// A real-world payment routinely lands a little short of an order's exact total — a bank transfer
// moves whole Naira while VAT/service-charge math produces totals with a fractional kobo remainder,
// and no restaurant chases down a shortfall that small. Shared by every payment-closing path
// (cash/card/other in orders.service.ts, Moniepoint transfer reconciliation in moniepoint.service.ts)
// so the write-off threshold can't drift between them the way role/nav lists once did.
export const PAYMENT_WRITEOFF_TOLERANCE = 1; // ₦1

export interface ResolvedPayment {
  /** What to actually persist as the order's amountPaid. */
  amountPaid: number;
  /** Whether this payment fully settles the order (closes it as paid). */
  isComplete: boolean;
  /** >0 when a shortfall within tolerance was forgiven rather than left as a stray balance. */
  writeOff: number;
}

/**
 * Given the amount actually received (accumulated on top of whatever was already paid) and the
 * order's total, decides whether this counts as "fully paid." A shortfall within
 * PAYMENT_WRITEOFF_TOLERANCE is written off: amountPaid is bumped up to match total exactly (so no
 * part of the app ever shows a stray sub-₦1 balance on an order that's otherwise closed), and the
 * forgiven amount is returned for an audit note. A larger shortfall is left untouched — still a
 * genuine partial payment.
 */
export function resolvePayment(rawAmountPaid: number, total: number): ResolvedPayment {
  const shortfall = Math.round((total - rawAmountPaid) * 100) / 100;
  if (shortfall > 0 && shortfall <= PAYMENT_WRITEOFF_TOLERANCE) {
    return { amountPaid: total, isComplete: true, writeOff: shortfall };
  }
  // The usual sub-kobo float-math slop (not a real shortfall) still counts as complete.
  return { amountPaid: rawAmountPaid, isComplete: rawAmountPaid >= total - 0.01, writeOff: 0 };
}
