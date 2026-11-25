import { classifyPaymentMethod } from './payment-method-kind';

// Tips are card/transfer only — cash tips stay out of the system, and wallet/other tenders have
// no real money moving through the till or bank that we'd be holding for a waiter.
export function isTipEligibleMethod(paymentMethod: string): boolean {
  const kind = classifyPaymentMethod(paymentMethod);
  return kind === 'card' || kind === 'transfer';
}

// A tip this big is usually a fat-finger (an extra zero) or a cashier padding the amount, so the
// till asks the guest to confirm: anything above ₦20,000, or above half the bill.
export const TIP_CONFIRM_ABOVE = 20_000;
export const TIP_CONFIRM_RATIO = 0.5;

export function tipNeedsConfirmation(tipAmount: number, billTotal: number): boolean {
  if (tipAmount > TIP_CONFIRM_ABOVE) return true;
  return billTotal > 0 && tipAmount > billTotal * TIP_CONFIRM_RATIO;
}

export const DEFAULT_TIP_PRESETS = [1000, 3000, 5000];
export const MAX_TIP_PRESETS = 6;
